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
    image_ops::{convert_image, get_image_info, read_exif, resize_image, strip_exif},
    keychain::{delete_api_key, get_api_key, get_api_key_summary, store_api_key},
    preferences::{check_preferences_recovery, dismiss_preferences_recovery, get_preferences, set_preferences},
    system::{get_app_version, get_arch, get_platform},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // macOS requires a native Edit menu for Cmd+V/C/X/A to reach the
        // webview. Without this, those shortcuts are intercepted by the
        // platform and never forwarded to the React application. The app
        // menu (first submenu) provides the standard About/Hide/Quit items.
        .menu(|handle| {
            use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

            let app_menu = Submenu::with_items(
                handle,
                "ToolBox",
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;

            Menu::with_items(handle, &[&app_menu, &edit_menu, &window_menu])
        })
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
            // image
            get_image_info,
            resize_image,
            convert_image,
            strip_exif,
            read_exif,
            // preferences
            get_preferences,
            check_preferences_recovery,
            dismiss_preferences_recovery,
            set_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
