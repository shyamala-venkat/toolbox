//! Preferences IPC commands.
//!
//! Thin wrappers around `crate::storage::preferences::{load, save}` that:
//!   1. Resolve the app data directory from the Tauri `AppHandle`.
//!   2. Validate every numeric and collection field before persisting, so a
//!      compromised renderer cannot push out-of-range values to disk.
//!   3. Never log or echo the full preference blob on error — we only return
//!      a short reason string.

use crate::storage::preferences::{self, UserPreferences};
use tauri::Manager;

/// Hard caps chosen to keep the preferences file small and the UI sane.
const SIDEBAR_WIDTH_MIN: u32 = 48;
const SIDEBAR_WIDTH_MAX: u32 = 500;
const FONT_SIZE_MIN: u32 = 10;
const FONT_SIZE_MAX: u32 = 24;
const MAX_RECENT: usize = 20;
const MAX_FAVORITES: usize = 100;
const MAX_TOOL_ID_LEN: usize = 64;
/// Hard cap on the serialized size of `tool_defaults`. Each tool stores at
/// most a handful of small fields, so 64 KB is a generous ceiling — well
/// above any realistic per-tool defaults blob, low enough that a compromised
/// renderer can't fill the user's disk via the preferences IPC.
const MAX_TOOL_DEFAULTS_BYTES: usize = 64 * 1024;

const ALLOWED_THEMES: &[&str] = &["system", "light", "dark"];

fn resolve_app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))
}

fn validate_tool_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("tool id must not be empty".to_string());
    }
    if id.len() > MAX_TOOL_ID_LEN {
        return Err(format!(
            "tool id exceeds max length ({MAX_TOOL_ID_LEN} chars)"
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("tool id contains invalid characters".to_string());
    }
    Ok(())
}

fn validate(prefs: &UserPreferences) -> Result<(), String> {
    if !ALLOWED_THEMES.contains(&prefs.theme.as_str()) {
        return Err(format!(
            "invalid theme '{}'; allowed: {}",
            prefs.theme,
            ALLOWED_THEMES.join(", ")
        ));
    }
    if prefs.sidebar_width < SIDEBAR_WIDTH_MIN || prefs.sidebar_width > SIDEBAR_WIDTH_MAX {
        return Err(format!(
            "sidebar_width out of range ({SIDEBAR_WIDTH_MIN}..={SIDEBAR_WIDTH_MAX})"
        ));
    }
    if prefs.monospace_font_size < FONT_SIZE_MIN || prefs.monospace_font_size > FONT_SIZE_MAX {
        return Err(format!(
            "monospace_font_size out of range ({FONT_SIZE_MIN}..={FONT_SIZE_MAX})"
        ));
    }
    if prefs.recent_tool_ids.len() > MAX_RECENT {
        return Err(format!("recent_tool_ids exceeds max length ({MAX_RECENT})"));
    }
    if prefs.favorite_tool_ids.len() > MAX_FAVORITES {
        return Err(format!(
            "favorite_tool_ids exceeds max length ({MAX_FAVORITES})"
        ));
    }
    for id in &prefs.recent_tool_ids {
        validate_tool_id(id)?;
    }
    for id in &prefs.favorite_tool_ids {
        validate_tool_id(id)?;
    }
    if !prefs.tool_defaults.is_object() {
        return Err("tool_defaults must be a JSON object".to_string());
    }
    // Bound the serialized size of `tool_defaults` so a compromised renderer
    // can't push a multi-megabyte blob across the IPC and fill the user's
    // disk via atomic preferences writes.
    let tool_defaults_bytes = serde_json::to_vec(&prefs.tool_defaults)
        .map_err(|e| format!("failed to serialize tool_defaults: {e}"))?;
    if tool_defaults_bytes.len() > MAX_TOOL_DEFAULTS_BYTES {
        return Err(format!(
            "tool_defaults exceeds max size ({MAX_TOOL_DEFAULTS_BYTES} bytes)"
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_preferences(app: tauri::AppHandle) -> Result<UserPreferences, String> {
    let dir = resolve_app_data_dir(&app)?;
    Ok(preferences::load(&dir))
}

/// Check if a corrupted preferences backup exists. The frontend calls this
/// on app start and shows a toast so the user knows their settings were reset.
#[tauri::command]
pub async fn check_preferences_recovery(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = resolve_app_data_dir(&app)?;
    let bad_path = dir.join("preferences.json.bad");
    Ok(bad_path.exists())
}

/// Clear the corrupted preferences backup after the user has been notified.
#[tauri::command]
pub async fn dismiss_preferences_recovery(app: tauri::AppHandle) -> Result<(), String> {
    let dir = resolve_app_data_dir(&app)?;
    let bad_path = dir.join("preferences.json.bad");
    if bad_path.exists() {
        std::fs::remove_file(&bad_path)
            .map_err(|e| format!("failed to remove recovery file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_preferences(
    app: tauri::AppHandle,
    prefs: UserPreferences,
) -> Result<(), String> {
    validate(&prefs)?;
    let dir = resolve_app_data_dir(&app)?;
    preferences::save(&dir, &prefs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn baseline() -> UserPreferences {
        UserPreferences {
            theme: "system".to_string(),
            sidebar_collapsed: false,
            sidebar_width: 240,
            smart_detection_enabled: true,
            auto_process_on_paste: false,
            clear_input_on_tool_switch: false,
            favorite_tool_ids: Vec::new(),
            recent_tool_ids: Vec::new(),
            compact_mode: false,
            monospace_font_size: 14,
            tool_defaults: serde_json::Value::Object(serde_json::Map::new()),
        }
    }

    #[test]
    fn validate_accepts_baseline() {
        assert!(validate(&baseline()).is_ok());
    }

    #[test]
    fn validate_rejects_oversized_tool_defaults() {
        let mut prefs = baseline();
        // Build a single string field whose serialized form blows past the cap.
        let huge_value = "a".repeat(MAX_TOOL_DEFAULTS_BYTES + 1024);
        let mut obj = serde_json::Map::new();
        obj.insert("payload".to_string(), serde_json::Value::String(huge_value));
        prefs.tool_defaults = serde_json::Value::Object(obj);

        let result = validate(&prefs);
        assert!(result.is_err(), "expected oversized tool_defaults rejection");
        assert!(
            result.unwrap_err().contains("exceeds max size"),
            "error should mention size cap",
        );
    }

    #[test]
    fn validate_accepts_small_tool_defaults() {
        let mut prefs = baseline();
        let mut obj = serde_json::Map::new();
        let mut tool = serde_json::Map::new();
        tool.insert("indent".to_string(), serde_json::json!(2));
        tool.insert("sortKeys".to_string(), serde_json::json!(false));
        obj.insert("json-formatter".to_string(), serde_json::Value::Object(tool));
        prefs.tool_defaults = serde_json::Value::Object(obj);
        assert!(validate(&prefs).is_ok());
    }
}
