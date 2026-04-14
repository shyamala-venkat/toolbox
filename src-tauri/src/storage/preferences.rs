//! User preferences read/write.
//!
//! Stored as JSON at `app_data_dir/preferences.json`. The loader is forgiving:
//! a missing or malformed file always yields `UserPreferences::default()` and
//! never panics. Callers can therefore assume `load()` is total.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const PREFERENCES_FILENAME: &str = "preferences.json";

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
        Ok(prefs) => prefs,
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
