//! Tool-history IPC commands.
//!
//! Thin wrappers over `crate::storage::history::HistoryStore` that:
//!   1. Pull the shared store from Tauri's managed state.
//!   2. Translate `HistoryError` into the IPC contract (string error or a
//!      typed result for `add_history_entry` / `pin_history_entry`).
//!   3. Validate caller-controlled IDs and payload bounds at the trust
//!      boundary. The store does its own checks; these are first-line.

use crate::storage::history::{
    AddEntryInput, AddEntryResult, HistoryEntry, HistoryError, HistoryStore, PinResult, Retention,
    StorageStats, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES,
};
use crate::storage::preferences;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// Tauri-managed state for the history store.
///
/// Three states:
///   - `Active(store)` — happy path, all commands work.
///   - `Failed(reason)` — init failed at app startup; commands return the
///     reason string so the frontend can show it directly. The most common
///     cause is keychain access denial on first launch (macOS prompt).
///   - The legacy `Option`-shaped variant kept around for tests that
///     pre-date this enum is collapsed into `Active(Some)` / `Failed(...)`.
pub enum HistoryState {
    Active(HistoryStore),
    Failed(String),
}

impl HistoryState {
    /// Convenience constructor for "init succeeded, here is the store".
    pub fn active(store: HistoryStore) -> Self {
        Self::Active(store)
    }

    /// Convenience constructor for "init failed for this reason."
    pub fn failed(reason: impl Into<String>) -> Self {
        Self::Failed(reason.into())
    }
}

fn store(state: &HistoryState) -> Result<&HistoryStore, String> {
    match state {
        HistoryState::Active(s) => Ok(s),
        HistoryState::Failed(reason) => Err(format!(
            "history is unavailable this session: {reason}"
        )),
    }
}

fn map_err(e: HistoryError) -> String {
    e.to_string()
}

const MAX_TOOL_ID_LEN: usize = 64;

fn validate_tool_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("tool id must not be empty".to_string());
    }
    if id.len() > MAX_TOOL_ID_LEN {
        return Err("tool id exceeds max length".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("tool id contains invalid characters".to_string());
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct AddHistoryEntryArgs {
    pub tool_id: String,
    pub input: String,
    pub output: String,
    /// Defaults to an empty object so callers don't have to pass it.
    #[serde(default = "default_params")]
    pub params: serde_json::Value,
}

fn default_params() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

#[tauri::command]
pub async fn add_history_entry(
    args: AddHistoryEntryArgs,
    state: State<'_, HistoryState>,
) -> Result<AddEntryResult, String> {
    validate_tool_id(&args.tool_id)?;
    // First-line size cap; the store re-checks but this short-circuits the
    // ~megabyte allocation before it crosses into storage logic.
    if args.input.len() > MAX_INPUT_BYTES || args.output.len() > MAX_OUTPUT_BYTES {
        return Ok(AddEntryResult {
            stored: false,
            reason: Some("size_cap".to_string()),
            entry: None,
        });
    }
    let store = store(&state)?;
    store
        .add_entry(AddEntryInput {
            tool_id: args.tool_id,
            input: args.input,
            output: args.output,
            params: args.params,
        })
        .map_err(map_err)
}

#[derive(Debug, Deserialize)]
pub struct ListHistoryArgs {
    pub tool_id: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub before_timestamp: Option<String>,
}

fn default_limit() -> i64 {
    50
}

#[tauri::command]
pub async fn list_history(
    args: ListHistoryArgs,
    state: State<'_, HistoryState>,
) -> Result<Vec<HistoryEntry>, String> {
    if let Some(ref tid) = args.tool_id {
        validate_tool_id(tid)?;
    }
    let store = store(&state)?;
    store
        .list_entries(args.tool_id.as_deref(), args.limit, args.before_timestamp.as_deref())
        .map_err(map_err)
}

#[derive(Debug, Deserialize)]
pub struct GetHistoryEntryArgs {
    pub id: i64,
}

#[tauri::command]
pub async fn get_history_entry(
    args: GetHistoryEntryArgs,
    state: State<'_, HistoryState>,
) -> Result<Option<HistoryEntry>, String> {
    let store = store(&state)?;
    store.get_entry(args.id).map_err(map_err)
}

#[derive(Debug, Deserialize)]
pub struct DeleteHistoryEntryArgs {
    pub id: i64,
}

#[tauri::command]
pub async fn delete_history_entry(
    args: DeleteHistoryEntryArgs,
    state: State<'_, HistoryState>,
) -> Result<(), String> {
    let store = store(&state)?;
    store.delete_entry(args.id).map_err(map_err)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ClearHistoryArgs {
    pub tool_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClearHistoryResult {
    pub removed: usize,
}

#[tauri::command]
pub async fn clear_history(
    args: ClearHistoryArgs,
    state: State<'_, HistoryState>,
) -> Result<ClearHistoryResult, String> {
    if let Some(ref tid) = args.tool_id {
        validate_tool_id(tid)?;
    }
    let store = store(&state)?;
    let removed = store
        .clear_history(args.tool_id.as_deref())
        .map_err(map_err)?;
    Ok(ClearHistoryResult { removed })
}

#[derive(Debug, Deserialize)]
pub struct PinHistoryEntryArgs {
    pub id: i64,
    pub pinned: bool,
}

#[derive(Debug, Serialize)]
pub struct PinHistoryEntryResult {
    pub ok: bool,
    /// `Some("pin_cap" | "is_tombstone" | "not_found")` when `ok = false`.
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn pin_history_entry(
    args: PinHistoryEntryArgs,
    state: State<'_, HistoryState>,
) -> Result<PinHistoryEntryResult, String> {
    let store = store(&state)?;
    let result = store.pin_entry(args.id, args.pinned).map_err(map_err)?;
    Ok(match result {
        PinResult::Ok => PinHistoryEntryResult { ok: true, reason: None },
        PinResult::PinCap => PinHistoryEntryResult {
            ok: false,
            reason: Some("pin_cap".to_string()),
        },
        PinResult::IsTombstone => PinHistoryEntryResult {
            ok: false,
            reason: Some("is_tombstone".to_string()),
        },
        PinResult::NotFound => PinHistoryEntryResult {
            ok: false,
            reason: Some("not_found".to_string()),
        },
    })
}

#[derive(Debug, Deserialize)]
pub struct SetHistoryPausedArgs {
    pub paused: bool,
}

#[tauri::command]
pub async fn set_history_paused(
    app: tauri::AppHandle,
    args: SetHistoryPausedArgs,
    state: State<'_, HistoryState>,
) -> Result<(), String> {
    let store = store(&state)?;
    store.set_paused(args.paused).map_err(map_err)?;
    // Persist to preferences so the flag survives restarts (H1). Failure to
    // persist is logged but non-fatal: the in-memory flag is correct for
    // this session and the user can flip it again next launch.
    persist_history_pref(&app, |h| {
        h.paused = args.paused;
    });
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct SetHistoryRetentionArgs {
    pub ttl: String,
}

#[tauri::command]
pub async fn set_history_retention(
    app: tauri::AppHandle,
    args: SetHistoryRetentionArgs,
    state: State<'_, HistoryState>,
) -> Result<(), String> {
    let retention = Retention::parse(&args.ttl).map_err(map_err)?;
    let store = store(&state)?;
    // `set_retention` runs a sweep internally (H2) so callers get an immediate
    // policy effect.
    store.set_retention(retention).map_err(map_err)?;
    persist_history_pref(&app, |h| {
        h.retention = args.ttl.clone();
    });
    Ok(())
}

/// Apply `mutate` to the `history` slice of the on-disk preferences and
/// rewrite atomically. Errors are logged, never propagated: history-pref
/// persistence is best-effort. The in-memory `HistoryStore` flag is the
/// authoritative value for the current session.
fn persist_history_pref<F: FnOnce(&mut preferences::HistoryPreferences)>(
    app: &tauri::AppHandle,
    mutate: F,
) {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[toolbox] history pref persist: no app_data_dir: {e}");
            return;
        }
    };
    let mut prefs = preferences::load(&dir);
    mutate(&mut prefs.history);
    if let Err(e) = preferences::save(&dir, &prefs) {
        eprintln!("[toolbox] history pref persist failed: {e}");
    }
}

#[tauri::command]
pub async fn history_storage_stats(
    state: State<'_, HistoryState>,
) -> Result<StorageStats, String> {
    let store = store(&state)?;
    store.storage_stats().map_err(map_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_tool_id_accepts_known_shape() {
        assert!(validate_tool_id("json-formatter").is_ok());
        assert!(validate_tool_id("base64").is_ok());
        assert!(validate_tool_id("password_gen").is_ok());
    }

    #[test]
    fn validate_tool_id_rejects_garbage() {
        assert!(validate_tool_id("").is_err());
        assert!(validate_tool_id("../etc").is_err());
        assert!(validate_tool_id("a b").is_err());
        assert!(validate_tool_id(&"a".repeat(MAX_TOOL_ID_LEN + 1)).is_err());
    }
}
