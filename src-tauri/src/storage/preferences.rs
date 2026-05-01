//! User preferences read/write.
//!
//! Stored as JSON at `app_data_dir/preferences.json`. The loader is forgiving:
//! a missing or malformed file always yields `UserPreferences::default()` and
//! never panics. Callers can therefore assume `load()` is total.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const PREFERENCES_FILENAME: &str = "preferences.json";

/// Persisted history-feature preferences. Mirrors the TS
/// `HistoryDefaults` shape in `src/lib/sanitizeHistoryDefaults.ts`. Field
/// names use camelCase on the wire so the renderer can read this slice
/// directly without translation.
///
/// Defaults intentionally match the TS sanitizer's `DEFAULT_HISTORY_DEFAULTS`:
/// drawer collapsed, history active, 7-day retention, no toast dismissal,
/// no per-tool overrides.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HistoryPreferences {
    /// Global drawer expand state (false = collapsed-to-rail per plan C4).
    pub drawer_expanded: bool,
    /// Global pause flag. Mirrors the in-memory flag on `HistoryStore`.
    pub paused: bool,
    /// Retention TTL: one of `"1d"`, `"7d"`, `"30d"`, `"forever"`. Validated
    /// in `commands::preferences::validate`.
    pub retention: String,
    /// Whether the user has dismissed the first sensitive-block toast.
    pub first_block_toast_dismissed: bool,
    /// Per-tool always-pause overrides keyed by tool id.
    pub per_tool_paused: HashMap<String, bool>,
}

impl Default for HistoryPreferences {
    fn default() -> Self {
        Self {
            drawer_expanded: false,
            paused: false,
            retention: "7d".to_string(),
            first_block_toast_dismissed: false,
            per_tool_paused: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UserPreferences {
    pub theme: String,
    pub sidebar_collapsed: bool,
    pub sidebar_width: u32,
    pub smart_detection_enabled: bool,
    pub auto_process_on_paste: bool,
    pub clear_input_on_tool_switch: bool,
    pub favorite_tool_ids: Vec<String>,
    pub recent_tool_ids: Vec<String>,
    pub compact_mode: bool,
    pub minimize_to_tray: bool,
    pub monospace_font_size: u32,
    pub accent_color: String,
    pub tool_defaults: serde_json::Value,
    /// History feature preferences (drawer state, pause, retention, etc.).
    /// Marked `#[serde(default)]` at the struct level so older preferences
    /// files without this key still load cleanly.
    pub history: HistoryPreferences,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            sidebar_collapsed: false,
            sidebar_width: 240,
            smart_detection_enabled: true,
            auto_process_on_paste: false,
            clear_input_on_tool_switch: false,
            favorite_tool_ids: Vec::new(),
            recent_tool_ids: Vec::new(),
            compact_mode: false,
            minimize_to_tray: true,
            monospace_font_size: 14,
            accent_color: "teal".to_string(),
            tool_defaults: serde_json::Value::Object(serde_json::Map::new()),
            history: HistoryPreferences::default(),
        }
    }
}

fn preferences_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(PREFERENCES_FILENAME)
}

/// Load user preferences from `app_data_dir/preferences.json`.
///
/// Returns `UserPreferences::default()` on any failure (missing file, IO error,
/// or malformed JSON). Never panics.
///
/// On JSON parse failure the corrupted file is renamed to
/// `preferences.json.bad` so the user can recover it manually, and the failure
/// is logged to stderr. We never log the file contents — only the error.
pub fn load(app_data_dir: &Path) -> UserPreferences {
    let path = preferences_path(app_data_dir);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return UserPreferences::default(),
    };
    match serde_json::from_slice::<UserPreferences>(&bytes) {
        Ok(mut prefs) => {
            migrate_history_shim(&mut prefs);
            prefs
        }
        Err(err) => {
            let bad_path = path.with_extension("json.bad");
            eprintln!(
                "[toolbox] preferences.json failed to parse: {err}; moving to preferences.json.bad and resetting to defaults"
            );
            if let Err(rename_err) = std::fs::rename(&path, &bad_path) {
                eprintln!(
                    "[toolbox] failed to rename corrupted preferences file: {rename_err}"
                );
            }
            UserPreferences::default()
        }
    }
}

/// Transitional shim from PR-A: the frontend temporarily wrote the history
/// slice into `tool_defaults["@history"]` before `UserPreferences.history`
/// existed. On first load with this binary, copy any values found there into
/// the proper `history` field and remove the legacy key. Idempotent: once
/// `@history` is gone, this is a no-op.
fn migrate_history_shim(prefs: &mut UserPreferences) {
    let Some(obj) = prefs.tool_defaults.as_object_mut() else {
        return;
    };
    let Some(legacy) = obj.remove("@history") else {
        return;
    };
    if let Ok(migrated) = serde_json::from_value::<HistoryPreferences>(legacy) {
        prefs.history = migrated;
    }
}

/// Persist user preferences to `app_data_dir/preferences.json`.
///
/// Creates the parent directory if it does not exist. The write is performed
/// atomically: the new file is staged at `<path>.tmp` and then renamed into
/// place so a crash mid-write cannot corrupt the existing preferences.
pub fn save(app_data_dir: &Path, prefs: &UserPreferences) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("failed to create preferences dir: {e}"))?;

    let path = preferences_path(app_data_dir);
    let tmp_path = path.with_extension("json.tmp");

    let json =
        serde_json::to_vec_pretty(prefs).map_err(|e| format!("failed to serialize prefs: {e}"))?;

    std::fs::write(&tmp_path, &json)
        .map_err(|e| format!("failed to write temp prefs file: {e}"))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("failed to rename temp prefs file: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("toolbox-prefs-test-")
            .tempdir()
            .expect("tempdir")
    }

    #[test]
    fn migrate_history_shim_moves_legacy_slice_into_history_field() {
        let tmp = tempdir();
        // Simulate a preferences.json written by PR-A frontend (history shim
        // lives under tool_defaults["@history"]).
        let path = preferences_path(tmp.path());
        let contents = serde_json::json!({
            "theme": "dark",
            "sidebarCollapsed": false,
            "sidebarWidth": 240,
            "smartDetectionEnabled": true,
            "autoProcessOnPaste": false,
            "clearInputOnToolSwitch": false,
            "favoriteToolIds": [],
            "recentToolIds": [],
            "compactMode": false,
            "minimizeToTray": true,
            "monospaceFontSize": 14,
            "accentColor": "teal",
            "tool_defaults": {
                "@history": {
                    "drawerExpanded": true,
                    "paused": true,
                    "retention": "30d",
                    "firstBlockToastDismissed": true,
                    "perToolPaused": {"json-formatter": true}
                }
            }
        });
        std::fs::write(&path, serde_json::to_vec(&contents).unwrap()).unwrap();

        let prefs = load(tmp.path());
        // Legacy slice migrated into the proper field.
        assert!(prefs.history.drawer_expanded);
        assert!(prefs.history.paused);
        assert_eq!(prefs.history.retention, "30d");
        assert!(prefs.history.first_block_toast_dismissed);
        assert_eq!(
            prefs.history.per_tool_paused.get("json-formatter").copied(),
            Some(true)
        );
        // Legacy key gone from tool_defaults.
        let td = prefs.tool_defaults.as_object().expect("tool_defaults object");
        assert!(!td.contains_key("@history"), "shim key should be removed");
    }

    #[test]
    fn migrate_history_shim_is_noop_when_absent() {
        let tmp = tempdir();
        let prefs_in = UserPreferences::default();
        save(tmp.path(), &prefs_in).unwrap();
        let prefs_out = load(tmp.path());
        // Defaults round-trip cleanly.
        assert_eq!(prefs_out.history.retention, "7d");
        assert!(!prefs_out.history.drawer_expanded);
        assert!(!prefs_out.history.paused);
    }

    #[test]
    fn round_trip_persists_history_fields() {
        let tmp = tempdir();
        let mut prefs_in = UserPreferences::default();
        prefs_in.history.paused = true;
        prefs_in.history.retention = "30d".to_string();
        prefs_in.history.drawer_expanded = true;
        prefs_in
            .history
            .per_tool_paused
            .insert("base64".to_string(), true);
        save(tmp.path(), &prefs_in).unwrap();

        let prefs_out = load(tmp.path());
        assert!(prefs_out.history.paused);
        assert_eq!(prefs_out.history.retention, "30d");
        assert!(prefs_out.history.drawer_expanded);
        assert_eq!(
            prefs_out.history.per_tool_paused.get("base64").copied(),
            Some(true)
        );
    }
}
