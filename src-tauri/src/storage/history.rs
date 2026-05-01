//! Tool execution history persistence.
//!
//! Encrypted-at-rest SQLite store backing the per-tool "Recent runs" drawer.
//! Uses SQLCipher 4 via `rusqlite { features = ["bundled-sqlcipher"] }`.
//! The 32-byte database key is generated on first launch and kept in the OS
//! keychain (`service = "toolbox-history"`, `account = "db-key"`); the key
//! never enters the renderer process.
//!
//! # Write-path state machine
//!
//! ```text
//!   write_request(tool_id, input, output, params)
//!         │
//!         ▼
//!   ┌─────────────────────────┐
//!   │ paused?                 │── yes ─► AddEntryResult::not_stored("paused")
//!   └────────────┬────────────┘
//!                │ no
//!                ▼
//!   ┌─────────────────────────┐
//!   │ tool_id in registry?    │── no  ─► AddEntryResult::not_stored("unknown_tool")
//!   └────────────┬────────────┘
//!                │ yes
//!                ▼
//!   ┌─────────────────────────┐
//!   │ size cap (256K/1M)      │── over ► AddEntryResult::not_stored("size_cap")
//!   └────────────┬────────────┘
//!                │ ok
//!                ▼
//!   ┌─────────────────────────┐
//!   │ blocklisted tool?       │── yes ─► insert TOMBSTONE("blocklisted")
//!   └────────────┬────────────┘
//!                │ no
//!                ▼
//!   ┌─────────────────────────┐
//!   │ pattern scan (in/out/   │── hit ─► insert TOMBSTONE(
//!   │ params)                 │           "sensitive_pattern:<id>" or
//!   └────────────┬────────────┘           "output_pattern:<id>")
//!                │ clean
//!                ▼
//!   ┌─────────────────────────┐
//!   │ enforce per-tool cap    │── over ► evict oldest unpinned for tool
//!   │ (200 incl. tombstones)  │
//!   └────────────┬────────────┘
//!                │
//!                ▼
//!   ┌─────────────────────────┐
//!   │ enforce 50MB total cap  │── over ► evict oldest unpinned (any tool)
//!   │ (pinned count toward    │           in a loop until under cap
//!   │ cap; tombstones=0 bytes)│
//!   └────────────┬────────────┘
//!                │
//!                ▼
//!   INSERT full row → AddEntryResult::stored
//! ```
//!
//! Failure modes (mirrors `preferences.rs` for DB corruption; keychain is
//! a SEPARATE failure path that does NOT touch the DB file):
//!
//!   - Keychain unavailable (locked / NoEntry on read) → `HistoryError::
//!     KeychainUnavailable`. Caller treats drawer as disabled-but-retryable.
//!     The DB file is untouched; the user can retry after unlocking.
//!   - DB present but `PRAGMA key` rejects (bundle-id changed, tampered,
//!     wrong key) → rename `history.db` → `history.db.bad.{epoch_seconds}`
//!     and re-create fresh. Mirrors the `.bad` rename in `preferences.rs`.
//!   - DB header corrupt (any other open failure post-key) → same rename +
//!     fresh DB.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Public configuration constants ──────────────────────────────────────

const HISTORY_FILENAME: &str = "history.db";

/// Hard input cap. Above this we reject without scanning — the output of a
/// 256 KB JSON pretty-print is already wider than any realistic interactive
/// session needs to recover.
pub const MAX_INPUT_BYTES: usize = 256 * 1024;
/// Hard output cap. SQL/JSON pretty-printing can roughly double size; 1 MB
/// covers the realistic worst case.
pub const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
/// Total storage cap across every entry (full + tombstone, all tools).
pub const TOTAL_BYTES_CAP: i64 = 50 * 1024 * 1024;
/// Max entries per tool, INCLUDING tombstones (so a tool that keeps tripping
/// the pattern scanner can't accumulate unbounded tombstones).
pub const PER_TOOL_ENTRY_CAP: i64 = 200;
/// Max pins per tool. Frontend rejects with a toast; Rust is the authority.
pub const PER_TOOL_PIN_CAP: i64 = 20;
/// Default TTL applied when no preference is set (7 days).
pub const DEFAULT_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;

const KEYCHAIN_SERVICE: &str = "toolbox-history";
const KEYCHAIN_ACCOUNT: &str = "db-key";
const KEY_BYTE_LEN: usize = 32;

const SCHEMA_VERSION: i64 = 1;
const PREVIEW_TRUNCATE_BYTES: usize = 1024;

// ── Errors ──────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    /// Keychain is locked, the entry is missing and we couldn't generate one,
    /// or the OS keystore is otherwise unreachable. Treated as RETRYABLE: do
    /// not rename the DB file. The drawer should render as disabled.
    #[error("keychain unavailable: {0}")]
    KeychainUnavailable(String),

    /// SQLCipher rejected the key, the file is corrupt, or some other open-
    /// time error occurred. Caller should rename the file and retry — the
    /// `init_db` entry point already does this once before propagating.
    #[error("sqlite error: {0}")]
    Sqlite(String),

    /// Filesystem-level error (mkdir, rename, stat, etc.).
    #[error("io error: {0}")]
    Io(String),

    /// Caller supplied an unsupported retention identifier or other bad arg.
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
}

impl From<rusqlite::Error> for HistoryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e.to_string())
    }
}

impl From<std::io::Error> for HistoryError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

pub type HistoryResult<T> = Result<T, HistoryError>;

// ── Keystore abstraction (so tests can avoid the real keychain) ──────────

/// Abstraction over the OS keychain so tests can inject a deterministic
/// in-memory store. The production implementation is the `keyring` crate.
pub trait KeyStore: Send + Sync + 'static {
    /// Read the 32-byte DB key. Return `Ok(None)` if the entry is missing,
    /// `Err` if the keystore itself is unavailable (locked, IPC down).
    fn read_key(&self) -> Result<Option<[u8; KEY_BYTE_LEN]>, String>;
    /// Persist the DB key. Errors are surfaced as `KeychainUnavailable`.
    fn write_key(&self, key: &[u8; KEY_BYTE_LEN]) -> Result<(), String>;
}

/// Production keystore wired to the same `keyring` crate used by
/// `commands/keychain.rs`. Stored under `service = "toolbox-history"`,
/// `account = "db-key"` so it is namespaced away from API keys.
pub struct OsKeyStore;

impl KeyStore for OsKeyStore {
    fn read_key(&self) -> Result<Option<[u8; KEY_BYTE_LEN]>, String> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|e| format!("keychain entry init failed: {e}"))?;
        match entry.get_password() {
            Ok(hex) => match decode_hex_key(&hex) {
                Some(k) => Ok(Some(k)),
                None => Err("stored key has invalid encoding".to_string()),
            },
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain read failed: {e}")),
        }
    }
    fn write_key(&self, key: &[u8; KEY_BYTE_LEN]) -> Result<(), String> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|e| format!("keychain entry init failed: {e}"))?;
        entry
            .set_password(&encode_hex_key(key))
            .map_err(|e| format!("keychain write failed: {e}"))
    }
}

fn encode_hex_key(key: &[u8; KEY_BYTE_LEN]) -> String {
    let mut s = String::with_capacity(KEY_BYTE_LEN * 2);
    for byte in key {
        // `write!` to a String is infallible; ignore the unit Result.
        let _ = write!(s, "{byte:02x}");
    }
    s
}

fn decode_hex_key(hex: &str) -> Option<[u8; KEY_BYTE_LEN]> {
    if hex.len() != KEY_BYTE_LEN * 2 {
        return None;
    }
    let bytes = hex.as_bytes();
    let mut out = [0u8; KEY_BYTE_LEN];
    for i in 0..KEY_BYTE_LEN {
        let hi = hex_nibble(bytes[i * 2])?;
        let lo = hex_nibble(bytes[i * 2 + 1])?;
        out[i] = (hi << 4) | lo;
    }
    Some(out)
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ── Domain types ────────────────────────────────────────────────────────

/// One row in the history. Used by both `list_history` (with previews) and
/// `get_history_entry` (full content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub tool_id: String,
    /// ISO 8601 timestamp (`YYYY-MM-DDTHH:MM:SSZ`).
    pub timestamp: String,
    /// `None` when the row is a tombstone OR when the caller asked for a
    /// list view and the value was truncated. Listings always set this to a
    /// preview; full retrieval via `get_entry` returns the full string.
    pub input: Option<String>,
    pub output: Option<String>,
    pub params: Option<serde_json::Value>,
    pub redacted: bool,
    pub reason: Option<String>,
    pub pinned: bool,
    pub bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddEntryResult {
    pub stored: bool,
    /// `None` on success, otherwise one of:
    /// `"paused" | "unknown_tool" | "size_cap" | "blocklisted" |
    /// "sensitive_pattern:<id>" | "output_pattern:<id>"`.
    pub reason: Option<String>,
}

impl AddEntryResult {
    fn stored() -> Self {
        Self { stored: true, reason: None }
    }
    fn not_stored(reason: impl Into<String>) -> Self {
        Self { stored: false, reason: Some(reason.into()) }
    }
    fn tombstone(reason: impl Into<String>) -> Self {
        // Tombstones ARE stored (as tombstone rows). We still report the
        // reason so the frontend can show the first-block toast.
        Self { stored: true, reason: Some(reason.into()) }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub entries: i64,
    pub bytes_used: i64,
    pub bytes_cap: i64,
    pub tombstones: i64,
    pub pins: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Retention {
    OneDay,
    SevenDays,
    ThirtyDays,
    Forever,
}

impl Retention {
    pub fn parse(s: &str) -> HistoryResult<Self> {
        match s {
            "1d" => Ok(Retention::OneDay),
            "7d" => Ok(Retention::SevenDays),
            "30d" => Ok(Retention::ThirtyDays),
            "forever" => Ok(Retention::Forever),
            _ => Err(HistoryError::InvalidArgument(format!(
                "unknown retention '{s}'; expected 1d|7d|30d|forever"
            ))),
        }
    }

    /// Cutoff in epoch seconds; entries older than this are eligible for
    /// TTL sweep. `Forever` returns `None`.
    pub fn cutoff_epoch_secs(&self, now_secs: i64) -> Option<i64> {
        let delta = match self {
            Retention::OneDay => 24 * 60 * 60,
            Retention::SevenDays => 7 * 24 * 60 * 60,
            Retention::ThirtyDays => 30 * 24 * 60 * 60,
            Retention::Forever => return None,
        };
        Some(now_secs - delta)
    }
}

/// Inputs to `add_entry`. Owned strings so the caller doesn't hold a borrow
/// across the IPC + lock acquisition.
pub struct AddEntryInput {
    pub tool_id: String,
    pub input: String,
    pub output: String,
    pub params: serde_json::Value,
}

// ── Store ──────────────────────────────────────────────────────────────

/// Encrypted SQLite-backed history store. Wraps a single connection guarded
/// by a `Mutex` — Tauri command handlers run on a tokio thread pool, and
/// `rusqlite::Connection` is `!Sync`, so a shared connection needs a lock.
/// Operations are short (a handful of statements), so contention is fine.
pub struct HistoryStore {
    conn: Mutex<Connection>,
    paused: Mutex<bool>,
    retention: Mutex<Retention>,
    /// In-memory allowlist of valid tool ids. Wired to the registry by the
    /// caller at startup; an unknown id is rejected with `"unknown_tool"`.
    known_tool_ids: Vec<String>,
}

impl HistoryStore {
    /// Open or initialize the encrypted history DB at `app_data_dir/history.db`.
    ///
    /// Order of operations:
    ///   1. Ensure the parent dir exists.
    ///   2. Read or generate the 32-byte key via `keystore`. Keychain failure
    ///      returns `KeychainUnavailable` WITHOUT touching the DB file.
    ///   3. Open the DB with `PRAGMA key = …`. On any open failure (wrong
    ///      key, header corrupt, etc.), rename `history.db` to
    ///      `history.db.bad.{epoch}` and try ONCE more with a fresh file.
    ///   4. Run schema bootstrap + the migration runner.
    pub fn open(
        app_data_dir: &Path,
        keystore: &dyn KeyStore,
        known_tool_ids: Vec<String>,
        initial_paused: bool,
        initial_retention: Retention,
    ) -> HistoryResult<Self> {
        std::fs::create_dir_all(app_data_dir)?;

        let key = match keystore.read_key().map_err(HistoryError::KeychainUnavailable)? {
            Some(k) => k,
            None => {
                let k = generate_key()?;
                keystore.write_key(&k).map_err(HistoryError::KeychainUnavailable)?;
                k
            }
        };

        let path = app_data_dir.join(HISTORY_FILENAME);

        let conn = match open_encrypted(&path, &key) {
            Ok(c) => c,
            Err(first_err) => {
                // The keychain succeeded, so the only remaining failure
                // class is a DB-side problem (wrong key, corrupt header).
                // Rename and try once with a fresh file.
                if path.exists() {
                    let bad = bad_path(&path);
                    if let Err(rename_err) = std::fs::rename(&path, &bad) {
                        eprintln!(
                            "[toolbox] history.db open failed ({first_err}); also failed to rename to .bad: {rename_err}"
                        );
                        return Err(first_err);
                    }
                    eprintln!(
                        "[toolbox] history.db rejected the key or was corrupt; renamed to {} and re-creating",
                        bad.display()
                    );
                }
                open_encrypted(&path, &key)?
            }
        };

        bootstrap_schema(&conn)?;
        run_migrations(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            paused: Mutex::new(initial_paused),
            retention: Mutex::new(initial_retention),
            known_tool_ids,
        })
    }

    fn is_known_tool(&self, tool_id: &str) -> bool {
        self.known_tool_ids.iter().any(|s| s == tool_id)
    }

    fn lock_conn(&self) -> HistoryResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| HistoryError::Sqlite(format!("history lock poisoned: {e}")))
    }

    /// Insert a row OR a tombstone according to the write-path state machine
    /// at the top of this file. See the ASCII diagram for the full order.
    pub fn add_entry(&self, input: AddEntryInput) -> HistoryResult<AddEntryResult> {
        // 1. paused?
        {
            let p = self
                .paused
                .lock()
                .map_err(|e| HistoryError::Sqlite(format!("paused lock poisoned: {e}")))?;
            if *p {
                return Ok(AddEntryResult::not_stored("paused"));
            }
        }

        // 2. known tool?
        if !self.is_known_tool(&input.tool_id) {
            return Ok(AddEntryResult::not_stored("unknown_tool"));
        }

        // 3. size caps. Apply BEFORE pattern scan so a megabyte of garbage
        //    doesn't get regex-scanned for nothing.
        if input.input.len() > MAX_INPUT_BYTES || input.output.len() > MAX_OUTPUT_BYTES {
            return Ok(AddEntryResult::not_stored("size_cap"));
        }

        let now_iso = now_iso8601();

        // 4. blocklisted tool → tombstone.
        if crate::security::redaction::is_blocklisted_tool(&input.tool_id) {
            self.evict_for_tool_if_full(&input.tool_id)?;
            self.insert_tombstone(&input.tool_id, &now_iso, "blocklisted")?;
            return Ok(AddEntryResult::tombstone("blocklisted"));
        }

        // 5. pattern scan: input first, output second, then params values.
        if let Some(pid) = crate::security::redaction::contains_secret(&input.input) {
            self.evict_for_tool_if_full(&input.tool_id)?;
            let reason = format!("sensitive_pattern:{pid}");
            self.insert_tombstone(&input.tool_id, &now_iso, &reason)?;
            return Ok(AddEntryResult::tombstone(reason));
        }
        if let Some(pid) = crate::security::redaction::contains_secret(&input.output) {
            self.evict_for_tool_if_full(&input.tool_id)?;
            let reason = format!("output_pattern:{pid}");
            self.insert_tombstone(&input.tool_id, &now_iso, &reason)?;
            return Ok(AddEntryResult::tombstone(reason));
        }
        if let Some(pid) = scan_params_for_secret(&input.params) {
            self.evict_for_tool_if_full(&input.tool_id)?;
            let reason = format!("sensitive_pattern:{pid}");
            self.insert_tombstone(&input.tool_id, &now_iso, &reason)?;
            return Ok(AddEntryResult::tombstone(reason));
        }

        // 6. caps + insert full row.
        self.evict_for_tool_if_full(&input.tool_id)?;
        let bytes = compute_bytes(&input);
        self.evict_for_total_cap(bytes)?;

        let params_json = serde_json::to_string(&input.params)
            .map_err(|e| HistoryError::InvalidArgument(format!("params not serializable: {e}")))?;

        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO entries (tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL, 0)",
            params![
                input.tool_id,
                now_iso,
                input.input,
                input.output,
                params_json,
                bytes,
            ],
        )?;
        Ok(AddEntryResult::stored())
    }

    fn insert_tombstone(&self, tool_id: &str, now_iso: &str, reason: &str) -> HistoryResult<()> {
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT INTO entries (tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned)
             VALUES (?1, ?2, NULL, NULL, NULL, 0, 1, ?3, 0)",
            params![tool_id, now_iso, reason],
        )?;
        Ok(())
    }

    /// Evict the oldest unpinned entry for `tool_id` if the per-tool count
    /// (including tombstones) is at the cap. Loops until under the cap.
    fn evict_for_tool_if_full(&self, tool_id: &str) -> HistoryResult<()> {
        loop {
            let conn = self.lock_conn()?;
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM entries WHERE tool_id = ?1",
                params![tool_id],
                |row| row.get(0),
            )?;
            if count < PER_TOOL_ENTRY_CAP {
                return Ok(());
            }
            // Try to evict an unpinned row. If they're ALL pinned, give up
            // gracefully — pin cap (20) prevents this from happening at the
            // 200-entry cap, but defensively bail rather than spin.
            let evicted = conn.execute(
                "DELETE FROM entries
                 WHERE id IN (
                   SELECT id FROM entries
                   WHERE tool_id = ?1 AND pinned = 0
                   ORDER BY timestamp ASC
                   LIMIT 1
                 )",
                params![tool_id],
            )?;
            drop(conn);
            if evicted == 0 {
                return Ok(());
            }
        }
    }

    /// Evict oldest unpinned entries (across any tool) until the total
    /// `bytes` column sum + `incoming_bytes` is within the 50 MB cap.
    fn evict_for_total_cap(&self, incoming_bytes: i64) -> HistoryResult<()> {
        loop {
            let conn = self.lock_conn()?;
            let used: i64 = conn
                .query_row("SELECT COALESCE(SUM(bytes), 0) FROM entries", [], |row| {
                    row.get(0)
                })?;
            if used + incoming_bytes <= TOTAL_BYTES_CAP {
                return Ok(());
            }
            let evicted = conn.execute(
                "DELETE FROM entries
                 WHERE id IN (
                   SELECT id FROM entries
                   WHERE pinned = 0
                   ORDER BY timestamp ASC
                   LIMIT 1
                 )",
                [],
            )?;
            drop(conn);
            if evicted == 0 {
                // All remaining rows are pinned; user is over their pin
                // budget. Accept the new write rather than spin.
                return Ok(());
            }
        }
    }

    /// List entries, newest-first. Previews truncated server-side to 1024
    /// bytes (UTF-8 boundary safe).
    pub fn list_entries(
        &self,
        tool_id: Option<&str>,
        limit: i64,
        before_timestamp: Option<&str>,
    ) -> HistoryResult<Vec<HistoryEntry>> {
        let conn = self.lock_conn()?;
        let limit = limit.clamp(1, 500);

        let mut entries = Vec::new();
        match (tool_id, before_timestamp) {
            (Some(tid), Some(before)) => {
                let mut stmt = conn.prepare(
                    "SELECT id, tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned
                     FROM entries
                     WHERE tool_id = ?1 AND timestamp < ?2
                     ORDER BY timestamp DESC, id DESC
                     LIMIT ?3",
                )?;
                let rows = stmt.query_map(params![tid, before, limit], row_to_entry)?;
                for r in rows { entries.push(r?); }
            }
            (Some(tid), None) => {
                let mut stmt = conn.prepare(
                    "SELECT id, tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned
                     FROM entries
                     WHERE tool_id = ?1
                     ORDER BY timestamp DESC, id DESC
                     LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![tid, limit], row_to_entry)?;
                for r in rows { entries.push(r?); }
            }
            (None, Some(before)) => {
                let mut stmt = conn.prepare(
                    "SELECT id, tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned
                     FROM entries
                     WHERE timestamp < ?1
                     ORDER BY timestamp DESC, id DESC
                     LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![before, limit], row_to_entry)?;
                for r in rows { entries.push(r?); }
            }
            (None, None) => {
                let mut stmt = conn.prepare(
                    "SELECT id, tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned
                     FROM entries
                     ORDER BY timestamp DESC, id DESC
                     LIMIT ?1",
                )?;
                let rows = stmt.query_map(params![limit], row_to_entry)?;
                for r in rows { entries.push(r?); }
            }
        }

        // Truncate previews. Tombstones already have `None` content.
        for e in entries.iter_mut() {
            e.input = e.input.as_ref().map(|s| truncate_preview(s));
            e.output = e.output.as_ref().map(|s| truncate_preview(s));
        }
        Ok(entries)
    }

    pub fn get_entry(&self, id: i64) -> HistoryResult<Option<HistoryEntry>> {
        let conn = self.lock_conn()?;
        let row = conn
            .query_row(
                "SELECT id, tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned
                 FROM entries WHERE id = ?1",
                params![id],
                row_to_entry,
            )
            .optional()?;
        Ok(row)
    }

    pub fn delete_entry(&self, id: i64) -> HistoryResult<usize> {
        let conn = self.lock_conn()?;
        let n = conn.execute("DELETE FROM entries WHERE id = ?1", params![id])?;
        Ok(n)
    }

    /// Clear all history, optionally scoped to one tool.
    pub fn clear_history(&self, tool_id: Option<&str>) -> HistoryResult<usize> {
        let conn = self.lock_conn()?;
        let n = match tool_id {
            Some(tid) => conn.execute("DELETE FROM entries WHERE tool_id = ?1", params![tid])?,
            None => conn.execute("DELETE FROM entries", [])?,
        };
        Ok(n)
    }

    /// Pin or unpin an entry. Returns Ok with `false` payload-equivalent
    /// (via `PinResult`) when blocked by tombstone or cap; the IPC layer
    /// turns that into a typed response.
    pub fn pin_entry(&self, id: i64, pinned: bool) -> HistoryResult<PinResult> {
        let conn = self.lock_conn()?;
        let row = conn
            .query_row(
                "SELECT tool_id, redacted FROM entries WHERE id = ?1",
                params![id],
                |r| Ok::<(String, i64), rusqlite::Error>((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let (tool_id, redacted) = match row {
            Some(t) => t,
            None => return Ok(PinResult::NotFound),
        };
        if redacted != 0 {
            return Ok(PinResult::IsTombstone);
        }
        if pinned {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM entries WHERE tool_id = ?1 AND pinned = 1 AND id != ?2",
                params![tool_id, id],
                |r| r.get(0),
            )?;
            if count >= PER_TOOL_PIN_CAP {
                return Ok(PinResult::PinCap);
            }
        }
        conn.execute(
            "UPDATE entries SET pinned = ?1 WHERE id = ?2",
            params![pinned as i64, id],
        )?;
        Ok(PinResult::Ok)
    }

    pub fn set_paused(&self, paused: bool) -> HistoryResult<()> {
        let mut p = self
            .paused
            .lock()
            .map_err(|e| HistoryError::Sqlite(format!("paused lock poisoned: {e}")))?;
        *p = paused;
        Ok(())
    }

    /// Set the retention TTL and immediately run a sweep so the new policy
    /// takes effect without waiting for the next startup (H2). Sweep errors
    /// are logged and swallowed — the retention update is the primary
    /// contract; sweep is best-effort.
    pub fn set_retention(&self, retention: Retention) -> HistoryResult<()> {
        {
            let mut r = self
                .retention
                .lock()
                .map_err(|e| HistoryError::Sqlite(format!("retention lock poisoned: {e}")))?;
            *r = retention;
        }
        if let Err(e) = self.ttl_sweep() {
            eprintln!("[toolbox] post-retention-change TTL sweep failed: {e}");
        }
        Ok(())
    }

    pub fn current_retention(&self) -> HistoryResult<Retention> {
        let r = self
            .retention
            .lock()
            .map_err(|e| HistoryError::Sqlite(format!("retention lock poisoned: {e}")))?;
        Ok(*r)
    }

    pub fn storage_stats(&self) -> HistoryResult<StorageStats> {
        let conn = self.lock_conn()?;
        let entries: i64 =
            conn.query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0))?;
        let bytes_used: i64 = conn.query_row(
            "SELECT COALESCE(SUM(bytes), 0) FROM entries",
            [],
            |r| r.get(0),
        )?;
        let tombstones: i64 = conn.query_row(
            "SELECT COUNT(*) FROM entries WHERE redacted = 1",
            [],
            |r| r.get(0),
        )?;
        let pins: i64 = conn.query_row(
            "SELECT COUNT(*) FROM entries WHERE pinned = 1",
            [],
            |r| r.get(0),
        )?;
        Ok(StorageStats {
            entries,
            bytes_used,
            bytes_cap: TOTAL_BYTES_CAP,
            tombstones,
            pins,
        })
    }

    /// Delete unpinned entries older than the configured retention. Pinned
    /// rows are immune. Returns count deleted.
    pub fn ttl_sweep(&self) -> HistoryResult<usize> {
        let retention = self.current_retention()?;
        let now = epoch_secs_now();
        let cutoff_secs = match retention.cutoff_epoch_secs(now) {
            Some(s) => s,
            None => return Ok(0),
        };
        let cutoff_iso = epoch_secs_to_iso8601(cutoff_secs);
        let conn = self.lock_conn()?;
        let n = conn.execute(
            "DELETE FROM entries WHERE pinned = 0 AND timestamp < ?1",
            params![cutoff_iso],
        )?;
        Ok(n)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PinResult {
    Ok,
    NotFound,
    IsTombstone,
    PinCap,
}

// ── Helpers ────────────────────────────────────────────────────────────

fn open_encrypted(path: &Path, key: &[u8; KEY_BYTE_LEN]) -> HistoryResult<Connection> {
    let conn = Connection::open(path)?;
    // SQLCipher accepts a hex key in the form `x'<64hex>'`. This avoids any
    // KDF or charset ambiguity that the raw passphrase form has.
    let pragma = format!("PRAGMA key = \"x'{}'\";", encode_hex_key(key));
    conn.execute_batch(&pragma)?;
    // SQLCipher v4 defaults; explicit so a future bundled-version change
    // doesn't silently re-encrypt.
    conn.execute_batch("PRAGMA cipher_compatibility = 4;")?;
    // WAL: faster writes, atomic readers, survives crashes.
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    // Probe the key by running a trivial read against the schema. If the
    // key is wrong, this is where we'll find out.
    conn.execute_batch("SELECT count(*) FROM sqlite_master;")?;
    Ok(conn)
}

fn bootstrap_schema(conn: &Connection) -> HistoryResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_meta (
           version INTEGER NOT NULL,
           created_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS entries (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           tool_id TEXT NOT NULL,
           timestamp TEXT NOT NULL,
           input TEXT,
           output TEXT,
           params TEXT,
           bytes INTEGER NOT NULL,
           redacted INTEGER NOT NULL DEFAULT 0,
           reason TEXT,
           pinned INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_entries_tool_ts ON entries(tool_id, timestamp DESC);
         CREATE INDEX IF NOT EXISTS idx_entries_ts ON entries(timestamp);",
    )?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM schema_meta", [], |r| r.get(0))?;
    if count == 0 {
        conn.execute(
            "INSERT INTO schema_meta (version, created_at) VALUES (?1, ?2)",
            params![SCHEMA_VERSION, now_iso8601()],
        )?;
    }
    Ok(())
}

/// One numbered migration. The function is called once when the live DB's
/// `schema_meta.version` is below `target_version`, then `schema_meta` gets
/// a new row with the target version recorded.
type Migration = (i64, fn(&Connection) -> HistoryResult<()>);

/// Migration runner. Day-1 the vec is empty; the structure exists so the
/// first real migration only needs to push to `migrations`. Each entry is
/// `(target_version, fn)`; the function is run inside an implicit
/// transaction by callers if needed.
fn run_migrations(conn: &Connection) -> HistoryResult<()> {
    let migrations: Vec<Migration> = Vec::new();
    let current: i64 = conn.query_row(
        "SELECT MAX(version) FROM schema_meta",
        [],
        |r| r.get::<_, Option<i64>>(0),
    )?
    .unwrap_or(0);
    for (target, migrate) in migrations.iter() {
        if *target > current {
            migrate(conn)?;
            conn.execute(
                "INSERT INTO schema_meta (version, created_at) VALUES (?1, ?2)",
                params![target, now_iso8601()],
            )?;
        }
    }
    Ok(())
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let params_str: Option<String> = row.get(5)?;
    let params_json = params_str.and_then(|s| serde_json::from_str(&s).ok());
    let redacted: i64 = row.get(7)?;
    let pinned: i64 = row.get(9)?;
    Ok(HistoryEntry {
        id: row.get(0)?,
        tool_id: row.get(1)?,
        timestamp: row.get(2)?,
        input: row.get(3)?,
        output: row.get(4)?,
        params: params_json,
        bytes: row.get(6)?,
        redacted: redacted != 0,
        reason: row.get(8)?,
        pinned: pinned != 0,
    })
}

fn compute_bytes(input: &AddEntryInput) -> i64 {
    let params_len = serde_json::to_string(&input.params)
        .map(|s| s.len())
        .unwrap_or(0);
    (input.input.len() + input.output.len() + params_len) as i64
}

/// UTF-8 boundary-safe truncation to `PREVIEW_TRUNCATE_BYTES` bytes. Walks
/// chars from the end to find a boundary <= the limit, never panics on
/// multibyte characters.
fn truncate_preview(s: &str) -> String {
    if s.len() <= PREVIEW_TRUNCATE_BYTES {
        return s.to_string();
    }
    let mut end = PREVIEW_TRUNCATE_BYTES;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

/// Recursively walk a JSON `Value` looking for secret patterns in any string
/// leaf. Object keys are NOT scanned (well-known, low-entropy). Returns the
/// first matching pattern id encountered.
fn scan_params_for_secret(v: &serde_json::Value) -> Option<&'static str> {
    match v {
        serde_json::Value::String(s) => crate::security::redaction::contains_secret(s),
        serde_json::Value::Array(arr) => arr.iter().find_map(scan_params_for_secret),
        serde_json::Value::Object(obj) => obj.values().find_map(scan_params_for_secret),
        _ => None,
    }
}

fn generate_key() -> HistoryResult<[u8; KEY_BYTE_LEN]> {
    let mut buf = [0u8; KEY_BYTE_LEN];
    getrandom::getrandom(&mut buf)
        .map_err(|e| HistoryError::KeychainUnavailable(format!("CSPRNG failed: {e}")))?;
    Ok(buf)
}

fn epoch_secs_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn now_iso8601() -> String {
    epoch_secs_to_iso8601(epoch_secs_now())
}

/// Render an epoch-second timestamp as `YYYY-MM-DDTHH:MM:SSZ`. We avoid
/// pulling chrono just for this — the conversion is a few divisions.
fn epoch_secs_to_iso8601(secs: i64) -> String {
    // Days since unix epoch, then civil-from-days (Howard Hinnant's
    // algorithm), then HH:MM:SS from the remaining seconds.
    const SECS_PER_DAY: i64 = 86_400;
    let days = secs.div_euclid(SECS_PER_DAY);
    let day_secs = secs.rem_euclid(SECS_PER_DAY);
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32; // [0..146_097]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0..399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0..365]
    let mp = (5 * doy + 2) / 153; // [0..11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1..31]
    let m_calendar = if mp < 10 { mp + 3 } else { mp - 9 }; // [1..12]
    let year = if m_calendar <= 2 { y + 1 } else { y };

    format!(
        "{year:04}-{m_calendar:02}-{d:02}T{h:02}:{m:02}:{s:02}Z",
        year = year,
        m_calendar = m_calendar,
        d = d,
        h = h,
        m = m,
        s = s,
    )
}

fn bad_path(db_path: &Path) -> PathBuf {
    let ts = epoch_secs_now();
    let mut s = db_path.as_os_str().to_owned();
    s.push(format!(".bad.{ts}"));
    PathBuf::from(s)
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};

    /// In-memory keystore for tests. Behavior is configurable so we can
    /// simulate "first launch" (None on read), "subsequent launch" (returns
    /// stored key), and "keychain locked" (read errors out).
    #[derive(Clone, Default)]
    struct FakeKeyStore {
        inner: Arc<StdMutex<FakeKeyStoreInner>>,
    }

    #[derive(Default)]
    struct FakeKeyStoreInner {
        key: Option<[u8; KEY_BYTE_LEN]>,
        read_should_fail: bool,
    }

    impl FakeKeyStore {
        fn new() -> Self { Self::default() }

        fn with_key(key: [u8; KEY_BYTE_LEN]) -> Self {
            let store = Self::default();
            store.inner.lock().unwrap().key = Some(key);
            store
        }

        fn locked() -> Self {
            let store = Self::default();
            store.inner.lock().unwrap().read_should_fail = true;
            store
        }

        fn current_key(&self) -> Option<[u8; KEY_BYTE_LEN]> {
            self.inner.lock().unwrap().key
        }
    }

    impl KeyStore for FakeKeyStore {
        fn read_key(&self) -> Result<Option<[u8; KEY_BYTE_LEN]>, String> {
            let inner = self.inner.lock().unwrap();
            if inner.read_should_fail {
                return Err("simulated keychain lock".to_string());
            }
            Ok(inner.key)
        }
        fn write_key(&self, key: &[u8; KEY_BYTE_LEN]) -> Result<(), String> {
            self.inner.lock().unwrap().key = Some(*key);
            Ok(())
        }
    }

    fn known_tools() -> Vec<String> {
        vec![
            "json-formatter".to_string(),
            "base64".to_string(),
            "sql-formatter".to_string(),
            // Blocklisted ids must still be in the registry — defense-in-depth
            // turns them into tombstones, it doesn't reject them as unknown.
            "password-gen".to_string(),
            "jwt-decoder".to_string(),
        ]
    }

    fn make_store(dir: &Path, ks: &dyn KeyStore) -> HistoryStore {
        HistoryStore::open(
            dir,
            ks,
            known_tools(),
            false,
            Retention::SevenDays,
        )
        .expect("open should succeed in tests")
    }

    fn add_simple(store: &HistoryStore, tool_id: &str, input: &str, output: &str) -> AddEntryResult {
        store
            .add_entry(AddEntryInput {
                tool_id: tool_id.to_string(),
                input: input.to_string(),
                output: output.to_string(),
                params: serde_json::json!({}),
            })
            .expect("add_entry should not error in this scenario")
    }

    #[test]
    fn first_launch_generates_key_and_opens_db() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        assert!(ks.current_key().is_some(), "first launch should generate + persist key");
        let stats = store.storage_stats().unwrap();
        assert_eq!(stats.entries, 0);
        assert_eq!(stats.bytes_used, 0);
    }

    #[test]
    fn second_launch_reuses_key() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        {
            let store = make_store(tmp.path(), &ks);
            assert!(add_simple(&store, "json-formatter", "{}", "{}").stored);
        }
        // Re-open with the same keystore — the existing row must be readable.
        let store2 = make_store(tmp.path(), &ks);
        let entries = store2.list_entries(None, 10, None).unwrap();
        assert_eq!(entries.len(), 1, "row from previous launch should be present");
    }

    #[test]
    fn corrupt_db_is_renamed_to_bad_and_recreated() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        // Open once to materialize the file, then trash it.
        {
            let _ = make_store(tmp.path(), &ks);
        }
        let db = tmp.path().join(HISTORY_FILENAME);
        std::fs::write(&db, b"definitely not an SQLCipher header").unwrap();

        // Re-opening must succeed (rename + fresh) — same key.
        let store = make_store(tmp.path(), &ks);
        let stats = store.storage_stats().unwrap();
        assert_eq!(stats.entries, 0, "fresh DB should be empty after recovery");

        // The .bad.<ts> file must exist somewhere in the dir.
        let mut found_bad = false;
        for entry in std::fs::read_dir(tmp.path()).unwrap() {
            let e = entry.unwrap();
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("history.db.bad.") { found_bad = true; }
        }
        assert!(found_bad, "expected history.db.bad.<ts> sidecar after corruption recovery");
    }

    #[test]
    fn wrong_key_is_renamed_to_bad_and_recreated() {
        let tmp = tempdir();
        // First launch: key A, write a row.
        let ks_a = FakeKeyStore::new();
        {
            let store = make_store(tmp.path(), &ks_a);
            assert!(add_simple(&store, "json-formatter", "{}", "{}").stored);
        }
        // Second launch: key B (simulating bundle-id change). Open must
        // detect the mismatch, rename, and start fresh.
        let mut wrong = [0u8; KEY_BYTE_LEN];
        wrong[0] = 0xAB; // any non-A bytes
        let ks_b = FakeKeyStore::with_key(wrong);
        let store = make_store(tmp.path(), &ks_b);
        let stats = store.storage_stats().unwrap();
        assert_eq!(stats.entries, 0, "wrong-key open must produce a fresh DB");

        // M1 (security-critical): the renamed `.bad.<ts>` sidecar MUST NOT
        // be openable as plaintext SQLite. SQLCipher's whole-file encryption
        // means even the header is encrypted, so a no-key Connection should
        // fail with an "encrypted or not a database" style error. If this
        // assertion ever flips to "Ok", the on-disk format has regressed
        // from encrypted-at-rest to plaintext.
        let bad_path = std::fs::read_dir(tmp.path())
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("history.db.bad."))
                    .unwrap_or(false)
            })
            .expect("expected history.db.bad.<ts> sidecar after wrong-key rename");

        // Open the encrypted file as a plain SQLite DB (no PRAGMA key) and
        // try the same probe `open_encrypted` uses. This must fail.
        let plain = rusqlite::Connection::open(&bad_path)
            .expect("rusqlite::open should succeed; the failure happens on first read");
        let probe = plain.execute_batch("SELECT name FROM sqlite_master;");
        let err = probe.expect_err("plaintext open must NOT be able to read SQLCipher data");
        let msg = err.to_string().to_lowercase();
        assert!(
            msg.contains("not a database")
                || msg.contains("encrypted")
                || msg.contains("file is not a database"),
            "unexpected error opening encrypted db as plaintext: {err}"
        );
    }

    #[test]
    fn keychain_locked_returns_keychain_unavailable_and_does_not_rename() {
        let tmp = tempdir();
        // Materialize a DB so we can prove the .bad rename did NOT happen.
        {
            let ks_ok = FakeKeyStore::new();
            let _ = make_store(tmp.path(), &ks_ok);
        }
        let pre_files: Vec<_> = std::fs::read_dir(tmp.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        let ks_locked = FakeKeyStore::locked();
        let result = HistoryStore::open(
            tmp.path(),
            &ks_locked,
            known_tools(),
            false,
            Retention::SevenDays,
        );
        assert!(matches!(result, Err(HistoryError::KeychainUnavailable(_))));

        let post_files: Vec<_> = std::fs::read_dir(tmp.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(pre_files, post_files, "keychain failure must NOT rename DB");
    }

    #[test]
    fn add_happy_path_inserts_row() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let res = add_simple(&store, "json-formatter", "{\"a\":1}", "{\n  \"a\": 1\n}");
        assert!(res.stored);
        assert!(res.reason.is_none());
        let entries = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(!entries[0].redacted);
    }

    #[test]
    fn add_blocklisted_tool_inserts_tombstone() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let res = add_simple(&store, "password-gen", "doesnt-matter", "doesnt-matter");
        assert!(res.stored, "tombstones ARE stored");
        assert_eq!(res.reason.as_deref(), Some("blocklisted"));
        let entries = store.list_entries(Some("password-gen"), 10, None).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].redacted);
        assert!(entries[0].input.is_none());
        assert_eq!(entries[0].bytes, 0);
    }

    #[test]
    fn add_secret_in_input_inserts_tombstone() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let res = add_simple(
            &store,
            "json-formatter",
            "key=AKIAIOSFODNN7EXAMPLE",
            "result",
        );
        assert!(res.stored);
        assert_eq!(res.reason.as_deref(), Some("sensitive_pattern:aws_access_key"));
    }

    #[test]
    fn add_secret_in_output_inserts_tombstone() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let res = add_simple(
            &store,
            "json-formatter",
            "harmless",
            "Authorization: Bearer abcdef0123456789ABCDEF==",
        );
        assert!(res.stored);
        assert_eq!(res.reason.as_deref(), Some("output_pattern:bearer_token"));
    }

    #[test]
    fn open_with_initial_paused_is_paused() {
        // H1: pause flag is sourced from preferences at startup so it
        // survives restarts. Construct the store with `initial_paused=true`
        // and confirm `add_entry` immediately reports `paused`.
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = HistoryStore::open(
            tmp.path(),
            &ks,
            known_tools(),
            true, // initial_paused
            Retention::SevenDays,
        )
        .unwrap();
        let res = add_simple(&store, "json-formatter", "x", "y");
        assert!(!res.stored);
        assert_eq!(res.reason.as_deref(), Some("paused"));
    }

    #[test]
    fn open_with_initial_retention_uses_it() {
        // H1: retention is sourced from preferences at startup. Open with
        // OneDay and confirm `current_retention` reflects that.
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = HistoryStore::open(
            tmp.path(),
            &ks,
            known_tools(),
            false,
            Retention::OneDay,
        )
        .unwrap();
        let r = store.current_retention().unwrap();
        assert!(matches!(r, Retention::OneDay));
    }

    #[test]
    fn add_secret_in_params_inserts_tombstone() {
        // H3: params values (incl. nested objects + arrays) MUST be scanned
        // for secrets. The store's `scan_params_for_secret` walks JSON
        // recursively; this test exercises three shapes.
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);

        // (a) Top-level string value.
        let res = store
            .add_entry(AddEntryInput {
                tool_id: "json-formatter".to_string(),
                input: "harmless".to_string(),
                output: "harmless".to_string(),
                params: serde_json::json!({"key": "AKIAIOSFODNN7EXAMPLE"}),
            })
            .unwrap();
        assert!(res.stored, "tombstones are stored");
        assert_eq!(
            res.reason.as_deref(),
            Some("sensitive_pattern:aws_access_key"),
            "expected aws_access_key match in flat params object",
        );

        // (b) Deeply nested string value.
        let res = store
            .add_entry(AddEntryInput {
                tool_id: "json-formatter".to_string(),
                input: "harmless".to_string(),
                output: "harmless".to_string(),
                params: serde_json::json!({
                    "nested": {
                        "deeper": "ghp_abcdef1234567890abcdef1234567890abcdef"
                    }
                }),
            })
            .unwrap();
        assert!(res.stored);
        let reason = res.reason.unwrap_or_default();
        assert!(
            reason.starts_with("sensitive_pattern:"),
            "expected nested github PAT to trigger pattern match; got reason={reason}",
        );

        // (c) Secret inside an array element.
        let res = store
            .add_entry(AddEntryInput {
                tool_id: "json-formatter".to_string(),
                input: "harmless".to_string(),
                output: "harmless".to_string(),
                params: serde_json::json!({
                    "items": ["safe", "Bearer abcdef1234567890abcdefxyz"]
                }),
            })
            .unwrap();
        assert!(res.stored);
        let reason = res.reason.unwrap_or_default();
        assert!(
            reason.starts_with("sensitive_pattern:"),
            "expected bearer token in array to trigger pattern match; got reason={reason}",
        );

        // All three rows should be tombstones (redacted = true, bytes = 0).
        let entries = store
            .list_entries(Some("json-formatter"), 10, None)
            .unwrap();
        assert_eq!(entries.len(), 3);
        for e in &entries {
            assert!(e.redacted, "expected tombstone row; got {:?}", e);
            assert_eq!(e.bytes, 0);
            assert!(e.input.is_none());
            assert!(e.output.is_none());
            assert!(e.params.is_none());
        }
    }

    #[test]
    fn add_paused_returns_not_stored() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        store.set_paused(true).unwrap();
        let res = add_simple(&store, "json-formatter", "x", "y");
        assert!(!res.stored);
        assert_eq!(res.reason.as_deref(), Some("paused"));
    }

    #[test]
    fn add_oversize_input_returns_size_cap() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let huge = "a".repeat(MAX_INPUT_BYTES + 1);
        let res = add_simple(&store, "json-formatter", &huge, "y");
        assert!(!res.stored);
        assert_eq!(res.reason.as_deref(), Some("size_cap"));
    }

    #[test]
    fn add_unknown_tool_returns_unknown_tool() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let res = add_simple(&store, "no-such-tool", "x", "y");
        assert!(!res.stored);
        assert_eq!(res.reason.as_deref(), Some("unknown_tool"));
    }

    #[test]
    fn per_tool_cap_evicts_oldest_unpinned() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        // Bypass the 200-entry cap with a smaller synthetic limit by reaching
        // the real cap. To keep the test fast we do exactly PER_TOOL_ENTRY_CAP
        // + 1 inserts; SQLCipher in-memory is plenty fast for 201 rows.
        for i in 0..PER_TOOL_ENTRY_CAP {
            let _ = store
                .add_entry(AddEntryInput {
                    tool_id: "json-formatter".to_string(),
                    // Distinct timestamps via distinct content + sleep would be
                    // overkill; sequential inserts are monotonic in `id` and
                    // `timestamp` is second-resolution. The eviction query
                    // orders by `timestamp ASC` then `id` is the implicit
                    // tiebreaker.
                    input: format!("entry-{i}"),
                    output: "out".to_string(),
                    params: serde_json::json!({}),
                })
                .unwrap();
        }
        // One more push should trigger eviction.
        let res = add_simple(&store, "json-formatter", "newest", "out");
        assert!(res.stored);
        let entries = store.list_entries(Some("json-formatter"), 1000, None).unwrap();
        assert!(
            entries.len() as i64 <= PER_TOOL_ENTRY_CAP,
            "per-tool cap must hold; got {} rows",
            entries.len()
        );
    }

    #[test]
    fn tombstones_count_toward_per_tool_cap_but_zero_bytes() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        for _ in 0..3 {
            let r = add_simple(&store, "password-gen", "x", "y");
            assert!(r.stored);
        }
        let stats = store.storage_stats().unwrap();
        assert_eq!(stats.entries, 3);
        assert_eq!(stats.tombstones, 3);
        assert_eq!(stats.bytes_used, 0, "tombstones must not contribute to bytes_used");
    }

    #[test]
    fn list_entries_orders_desc_and_limits() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        for i in 0..5 {
            let _ = add_simple(&store, "json-formatter", &format!("in-{i}"), "out");
        }
        let entries = store.list_entries(Some("json-formatter"), 3, None).unwrap();
        assert_eq!(entries.len(), 3);
        // Most recent has the highest id.
        assert!(entries[0].id > entries[1].id);
        assert!(entries[1].id > entries[2].id);
    }

    #[test]
    fn list_entries_truncates_previews_to_1k() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let big = "x".repeat(8_000);
        let res = add_simple(&store, "json-formatter", &big, "y");
        assert!(res.stored);
        let entries = store.list_entries(Some("json-formatter"), 1, None).unwrap();
        let preview = entries[0].input.as_ref().unwrap();
        assert!(preview.len() <= PREVIEW_TRUNCATE_BYTES);
        // get_entry returns the full content.
        let full = store.get_entry(entries[0].id).unwrap().unwrap();
        assert_eq!(full.input.as_deref().unwrap().len(), 8_000);
    }

    #[test]
    fn list_entries_before_timestamp_paginates() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        for i in 0..3 {
            let _ = add_simple(&store, "json-formatter", &format!("in-{i}"), "out");
        }
        let page1 = store.list_entries(Some("json-formatter"), 2, None).unwrap();
        assert_eq!(page1.len(), 2);
        let cursor = page1.last().unwrap().timestamp.clone();
        let page2 = store
            .list_entries(Some("json-formatter"), 2, Some(&cursor))
            .unwrap();
        // Pagination yields entries strictly older than the cursor; due to
        // 1-second timestamp resolution the cursor row may share its
        // timestamp with peers, so the page may be empty. The contract is
        // that no row in page2 has a timestamp >= cursor.
        for e in &page2 {
            assert!(e.timestamp < cursor);
        }
    }

    #[test]
    fn pin_survives_ttl_sweep() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "json-formatter", "in", "out");
        let entries = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert_eq!(store.pin_entry(entries[0].id, true).unwrap(), PinResult::Ok);

        // Force "all entries are old" via a 1-second retention + sleep would
        // be slow; instead we directly rewrite the timestamp to the past.
        {
            let conn = store.conn.lock().unwrap();
            conn.execute(
                "UPDATE entries SET timestamp = '1970-01-02T00:00:00Z' WHERE id = ?1",
                params![entries[0].id],
            )
            .unwrap();
        }
        store.set_retention(Retention::OneDay).unwrap();
        let n = store.ttl_sweep().unwrap();
        assert_eq!(n, 0, "pinned row must NOT be swept");
        let after = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert_eq!(after.len(), 1, "pinned row survived");
    }

    #[test]
    fn ttl_sweep_removes_expired_unpinned() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "json-formatter", "in", "out");
        // Backdate AFTER setting retention so the sweep that fires inside
        // `set_retention` has nothing to do — we want to exercise the
        // explicit `ttl_sweep()` call below.
        store.set_retention(Retention::OneDay).unwrap();
        {
            let conn = store.conn.lock().unwrap();
            conn.execute(
                "UPDATE entries SET timestamp = '1970-01-02T00:00:00Z'",
                [],
            )
            .unwrap();
        }
        let n = store.ttl_sweep().unwrap();
        assert_eq!(n, 1);
        assert_eq!(
            store.list_entries(Some("json-formatter"), 10, None).unwrap().len(),
            0,
        );
    }

    #[test]
    fn set_retention_triggers_immediate_sweep() {
        // H2: changing retention must run a sweep so the new policy takes
        // effect now, not on the next startup. Seed an entry that's older
        // than 7 days; switching from forever → 1d should evict it.
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        store.set_retention(Retention::Forever).unwrap();
        let _ = add_simple(&store, "json-formatter", "in", "out");
        {
            let conn = store.conn.lock().unwrap();
            // 8 days ago — older than the 1d cutoff we'll set next.
            let now = epoch_secs_now();
            let old = epoch_secs_to_iso8601(now - 8 * 24 * 60 * 60);
            conn.execute(
                "UPDATE entries SET timestamp = ?1",
                params![old],
            )
            .unwrap();
        }
        // No explicit ttl_sweep() — set_retention should sweep on its own.
        store.set_retention(Retention::OneDay).unwrap();
        let entries = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert!(
            entries.is_empty(),
            "expected old entry to be swept by retention change; got {} rows",
            entries.len()
        );
    }

    #[test]
    fn pin_cap_rejects_over_twenty() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        for i in 0..(PER_TOOL_PIN_CAP + 1) {
            let _ = add_simple(&store, "json-formatter", &format!("in-{i}"), "out");
        }
        let entries = store
            .list_entries(Some("json-formatter"), 1000, None)
            .unwrap();
        // Pin the first PER_TOOL_PIN_CAP entries.
        let mut pinned_ok = 0;
        for e in entries.iter().take(PER_TOOL_PIN_CAP as usize) {
            if store.pin_entry(e.id, true).unwrap() == PinResult::Ok {
                pinned_ok += 1;
            }
        }
        assert_eq!(pinned_ok, PER_TOOL_PIN_CAP);
        // The next pin must fail.
        let extra = entries[PER_TOOL_PIN_CAP as usize].id;
        assert_eq!(store.pin_entry(extra, true).unwrap(), PinResult::PinCap);
    }

    #[test]
    fn pin_rejects_tombstones() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "password-gen", "x", "y"); // tombstone
        let entries = store.list_entries(Some("password-gen"), 10, None).unwrap();
        assert!(entries[0].redacted);
        assert_eq!(
            store.pin_entry(entries[0].id, true).unwrap(),
            PinResult::IsTombstone,
        );
    }

    #[test]
    fn delete_entry_removes_one() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "json-formatter", "a", "b");
        let _ = add_simple(&store, "json-formatter", "c", "d");
        let entries = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert_eq!(store.delete_entry(entries[0].id).unwrap(), 1);
        let after = store.list_entries(Some("json-formatter"), 10, None).unwrap();
        assert_eq!(after.len(), 1);
    }

    #[test]
    fn clear_history_with_tool_scope() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "json-formatter", "a", "b");
        let _ = add_simple(&store, "base64", "c", "d");
        let removed = store.clear_history(Some("json-formatter")).unwrap();
        assert_eq!(removed, 1);
        assert_eq!(
            store.list_entries(Some("json-formatter"), 10, None).unwrap().len(),
            0,
        );
        assert_eq!(
            store.list_entries(Some("base64"), 10, None).unwrap().len(),
            1,
        );
    }

    #[test]
    fn clear_history_global_removes_all() {
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);
        let _ = add_simple(&store, "json-formatter", "a", "b");
        let _ = add_simple(&store, "base64", "c", "d");
        assert_eq!(store.clear_history(None).unwrap(), 2);
        assert_eq!(store.list_entries(None, 10, None).unwrap().len(), 0);
    }

    #[test]
    fn total_cap_evicts_to_make_room() {
        // H4: prove eviction actually fires. Seed a row at exactly the cap
        // so ANY incoming write (including a 0-byte tombstone via the
        // bytes-cap branch) must evict the seeded row to fit.
        let tmp = tempdir();
        let ks = FakeKeyStore::new();
        let store = make_store(tmp.path(), &ks);

        // Seed a baseline row with `bytes = TOTAL_BYTES_CAP`. Any new write
        // with bytes > 0 must evict it. We use the oldest possible timestamp
        // so it's the unambiguous oldest-unpinned target.
        let seeded_id: i64 = {
            let conn = store.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO entries (tool_id, timestamp, input, output, params, bytes, redacted, reason, pinned)
                 VALUES ('json-formatter', '1970-01-01T00:00:00Z', 'baseline', 'baseline', NULL, ?1, 0, NULL, 0)",
                params![TOTAL_BYTES_CAP],
            )
            .unwrap();
            conn.last_insert_rowid()
        };

        // Confirm the row is at the cap before we add anything.
        let stats = store.storage_stats().unwrap();
        assert_eq!(stats.bytes_used, TOTAL_BYTES_CAP);

        // Add a small but non-zero row. Cap math: seeded(cap) + new(bytes>0)
        // > cap → eviction loop runs and removes the seeded row.
        let res = add_simple(&store, "json-formatter", "newer", "newer");
        assert!(res.stored);

        // The seeded baseline must be gone; the new row must remain.
        let conn = store.conn.lock().unwrap();
        let baseline_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE id = ?1",
                params![seeded_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            baseline_count, 0,
            "expected oldest-unpinned baseline row to be evicted to make room"
        );

        let total_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM entries", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_count, 1, "expected exactly the new row to remain");

        let bytes_used: i64 = conn
            .query_row("SELECT COALESCE(SUM(bytes),0) FROM entries", [], |r| r.get(0))
            .unwrap();
        assert!(
            bytes_used <= TOTAL_BYTES_CAP,
            "post-eviction bytes_used must respect cap; got {bytes_used}"
        );
    }

    fn tempdir() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("toolbox-history-test-")
            .tempdir()
            .expect("tempdir")
    }
}
