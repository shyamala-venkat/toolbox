//! ToolBox library entry point.
//!
//! Wires plugins, registers commands, and bootstraps the Tauri runtime.
//! Keep this file thin: business logic belongs in the `commands`, `security`,
//! and `storage` modules.

pub mod commands;
pub mod security;
// NOTE: `security::rate_limiter` is currently a stub.
// TODO(phase-4): wire real token bucket when first rate-limited command lands.
pub mod storage;

use commands::{
    crypto::{hash_file, hash_text},
    file_ops::{read_text_file, stat_file, write_text_file},
    keychain::{delete_api_key, get_api_key, get_api_key_summary, store_api_key},
    preferences::{get_preferences, set_preferences},
    system::{get_app_version, get_arch, get_platform},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            // system
            get_platform,
            get_arch,
            get_app_version,
            // keychain
            store_api_key,
            get_api_key,
            get_api_key_summary,
            delete_api_key,
            // file ops
            read_text_file,
            write_text_file,
            stat_file,
            // crypto
            hash_file,
            hash_text,
            // preferences
            get_preferences,
            set_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
