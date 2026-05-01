//! Blocklist parity check (PR-B.3 — Tool History).
//!
//! Defense-in-depth requires the FRONTEND blocklist
//! (`sensitiveContent: true` flags in `src/tools/**/meta.ts`) to stay
//! identical to the BACKEND blocklist
//! (`SENSITIVE_TOOLS` in `src-tauri/src/security/redaction.rs`). A drift in
//! either direction is a privacy bug:
//!
//!   - A tool flagged sensitive in `meta.ts` but missing from `SENSITIVE_TOOLS`
//!     means a malicious renderer could bypass the frontend filter and have
//!     Rust persist sensitive content.
//!   - A tool flagged in `SENSITIVE_TOOLS` but not in `meta.ts` means the
//!     drawer renders for a tool whose runs Rust will silently tombstone,
//!     producing dead-end UX.
//!
//! This test scans every `meta.ts` file under `../src/tools/` (relative to
//! `src-tauri/`), parses the tool id and the presence of `sensitiveContent:
//! true`, and asserts the resulting set equals `SENSITIVE_TOOLS`. On
//! mismatch we emit a clear diff so the engineer can fix the offending file.
//!
//! A second test asserts that no meta is over-specified with BOTH
//! `sensitiveContent: true` AND `historyEligible: false` — those flags are
//! mutually redundant for drawer-suppression purposes; sensitive tools
//! already skip the drawer, so the explicit `historyEligible: false` is
//! noise that hides intent.
//!
//! Implementation notes:
//!   - No `walkdir` dependency — a small recursive walker keeps the dep
//!     surface minimal (CLAUDE.md "Dependency Policy").
//!   - Comments are stripped before regex-matching so a string like
//!     `// sensitiveContent: true` in a doc comment never trips the test.
//!   - Sets are sorted before comparison so the failure message is
//!     deterministic regardless of filesystem walk order.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use toolbox_lib::security::redaction::SENSITIVE_TOOLS;

/// Walks `dir` recursively and pushes every `meta.ts` path it finds onto
/// `out`. Symlinks are followed implicitly via `read_dir` — the source tree
/// is small and trusted, so the simple walk is fine.
fn collect_meta_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_meta_files(&path, out);
        } else if path.file_name().and_then(|n| n.to_str()) == Some("meta.ts") {
            out.push(path);
        }
    }
}

/// Strips `// line comments` and `/* block comments */` from the input. A
/// hand-rolled scan is enough because meta.ts files are small and the
/// patterns we're looking for never legitimately span multi-line strings.
/// We also avoid stripping inside string literals by tracking a basic
/// in-string state — meta.ts uses single quotes, double quotes, and
/// occasional template literals.
fn strip_comments(src: &str) -> String {
    let bytes = src.as_bytes();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;
    let mut in_string: Option<u8> = None;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(quote) = in_string {
            out.push(b as char);
            if b == b'\\' && i + 1 < bytes.len() {
                // Preserve escape sequences verbatim.
                out.push(bytes[i + 1] as char);
                i += 2;
                continue;
            }
            if b == quote {
                in_string = None;
            }
            i += 1;
            continue;
        }
        // Line comment.
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        // Block comment.
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        if b == b'\'' || b == b'"' || b == b'`' {
            in_string = Some(b);
        }
        out.push(b as char);
        i += 1;
    }
    out
}

/// Extracts the `id: '...'` value from a meta.ts source. Returns `None` if
/// the file doesn't follow the expected shape (we then skip it; the test
/// never silently accepts a misformatted meta because the count check below
/// will diverge).
fn extract_id(src: &str) -> Option<String> {
    // Match: id: 'foo'   or   id: "foo"
    // Whitespace-tolerant; deliberately strict on the surrounding shape so
    // we don't accidentally match an `id` inside a `tags` array or a
    // longDescription string.
    let trimmed = src;
    for (idx, c) in trimmed.char_indices() {
        if c != 'i' {
            continue;
        }
        // Look for `id` at the start of an identifier.
        if !trimmed[idx..].starts_with("id") {
            continue;
        }
        // Must be a fresh identifier — preceding char (if any) must not be
        // an alphanumeric or underscore (otherwise we'd match `valid` etc).
        if idx > 0 {
            let prev = trimmed.as_bytes()[idx - 1];
            if prev.is_ascii_alphanumeric() || prev == b'_' {
                continue;
            }
        }
        // Skip past `id`.
        let after = &trimmed[idx + 2..];
        // Skip whitespace.
        let after_ws = after.trim_start();
        if !after_ws.starts_with(':') {
            continue;
        }
        let value_part = after_ws[1..].trim_start();
        let quote_char = match value_part.chars().next() {
            Some('\'') => '\'',
            Some('"') => '"',
            _ => continue,
        };
        let after_quote = &value_part[1..];
        let close = after_quote.find(quote_char)?;
        return Some(after_quote[..close].to_string());
    }
    None
}

/// Returns true when the meta declares `sensitiveContent: true`. The
/// substring check is sufficient because comments are pre-stripped and the
/// flag is always written with that exact spelling per the `ToolMeta`
/// contract in `src/tools/types.ts`.
fn has_sensitive_flag(src: &str) -> bool {
    // Allow optional whitespace between the colon and `true`. Don't be
    // clever about it — a one-shot `replace`-then-`contains` is robust to
    // multi-space / tab formatting.
    let normalized = src.replace([' ', '\t', '\n', '\r'], "");
    normalized.contains("sensitiveContent:true")
}

fn has_history_eligible_false(src: &str) -> bool {
    let normalized = src.replace([' ', '\t', '\n', '\r'], "");
    normalized.contains("historyEligible:false")
}

/// Path to the `src/tools` directory relative to this integration test.
/// `cargo test` runs with CWD = the crate root (`src-tauri/`), so the
/// frontend tree sits one level up.
fn tools_dir() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    PathBuf::from(manifest_dir).join("..").join("src").join("tools")
}

/// Loads every `meta.ts` and returns parsed `(id, sensitive, history_eligible_false)` tuples,
/// sorted by id for determinism.
fn load_meta_records() -> Vec<(String, bool, bool)> {
    let tools = tools_dir();
    assert!(
        tools.is_dir(),
        "expected src/tools/ at {tools:?} — run `cargo test` from the repo root or src-tauri/",
    );
    let mut files: Vec<PathBuf> = Vec::new();
    collect_meta_files(&tools, &mut files);
    let mut records: Vec<(String, bool, bool)> = Vec::new();
    for f in files {
        let raw = fs::read_to_string(&f)
            .unwrap_or_else(|e| panic!("failed to read {}: {}", f.display(), e));
        let stripped = strip_comments(&raw);
        let id = match extract_id(&stripped) {
            Some(id) => id,
            None => panic!(
                "could not parse `id` from meta file {}; check the format.",
                f.display()
            ),
        };
        let sensitive = has_sensitive_flag(&stripped);
        let elig_false = has_history_eligible_false(&stripped);
        records.push((id, sensitive, elig_false));
    }
    records.sort();
    records
}

#[test]
fn sensitive_meta_flags_match_rust_blocklist() {
    let records = load_meta_records();
    let frontend: BTreeSet<String> = records
        .iter()
        .filter(|(_, sensitive, _)| *sensitive)
        .map(|(id, _, _)| id.clone())
        .collect();
    let backend: BTreeSet<String> = SENSITIVE_TOOLS.iter().map(|s| (*s).to_string()).collect();

    if frontend != backend {
        let only_frontend: Vec<&String> = frontend.difference(&backend).collect();
        let only_backend: Vec<&String> = backend.difference(&frontend).collect();
        panic!(
            "Sensitive blocklist drift between meta.ts and src-tauri/src/security/redaction.rs::SENSITIVE_TOOLS.\n\
             Tools with `sensitiveContent: true` in meta.ts but missing from SENSITIVE_TOOLS: {:?}\n\
             Tools in SENSITIVE_TOOLS but missing `sensitiveContent: true` in meta.ts: {:?}\n\
             Fix: add the tool id to BOTH lists or remove from BOTH.",
            only_frontend, only_backend,
        );
    }
}

#[test]
fn no_meta_is_both_sensitive_and_history_ineligible() {
    let records = load_meta_records();
    let offenders: Vec<&String> = records
        .iter()
        .filter(|(_, sensitive, elig_false)| *sensitive && *elig_false)
        .map(|(id, _, _)| id)
        .collect();
    assert!(
        offenders.is_empty(),
        "These tools declare BOTH `sensitiveContent: true` AND `historyEligible: false`. \
         Pick one: sensitive tools already skip the drawer, so the explicit \
         `historyEligible: false` is redundant and obscures intent. Offenders: {:?}",
        offenders,
    );
}
