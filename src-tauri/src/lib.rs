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
    finance::{
        get_finance_dataset, import_fx_snapshot, import_tax_snapshot, reset_finance_overlay,
    },
    history::{
        add_history_entry, clear_history, delete_history_entry, get_history_entry,
        history_storage_stats, list_history, pin_history_entry, set_history_paused,
        set_history_retention, HistoryState,
    },
    image_ops::{convert_image, get_image_info, read_exif, resize_image, strip_exif},
    keychain::{delete_api_key, get_api_key, get_api_key_summary, store_api_key},
    preferences::{check_preferences_recovery, dismiss_preferences_recovery, get_preferences, set_preferences},
    system::{get_app_version, get_arch, get_platform},
};
use storage::history::{HistoryStore, OsKeyStore, Retention};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // macOS requires a native Edit menu for Cmd+V/C/X/A to reach the
        // webview. Without this, those shortcuts are intercepted by the
        // platform and never forwarded to the React application. The app
        // menu (first submenu) provides the standard About/Hide/Quit items.
        .menu(|handle| {
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
            // finance
            get_finance_dataset,
            import_fx_snapshot,
            import_tax_snapshot,
            reset_finance_overlay,
            // history
            add_history_entry,
            list_history,
            get_history_entry,
            delete_history_entry,
            clear_history,
            pin_history_entry,
            set_history_paused,
            set_history_retention,
            history_storage_stats,
        ])
        .setup(|app| {
            // ── History store init (encrypted SQLite via SQLCipher) ──────
            //
            // Failure here is non-fatal: if the keychain is locked or the
            // DB cannot be opened, the rest of the app still works and the
            // history drawer renders its disabled state. The store is held
            // in Tauri-managed state so command handlers can find it.
            let history_state = match app.path().app_data_dir() {
                Ok(dir) => {
                    // Read persisted history preferences once at startup so
                    // pause/retention survive restarts (H1). Defaults to
                    // unpaused + 7-day retention if the file is missing or
                    // the field is corrupted (Retention::parse rejects bad
                    // strings — fall back rather than panic).
                    let prefs = storage::preferences::load(&dir);
                    let initial_paused = prefs.history.paused;
                    let initial_retention = Retention::parse(&prefs.history.retention)
                        .unwrap_or(Retention::SevenDays);
                    match HistoryStore::open(
                        &dir,
                        &OsKeyStore,
                        history_known_tool_ids(),
                        initial_paused,
                        initial_retention,
                    ) {
                        Ok(store) => HistoryState(Some(store)),
                        Err(e) => {
                            eprintln!("[toolbox] history store unavailable: {e}");
                            HistoryState(None)
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[toolbox] history store unavailable (no app data dir): {e}");
                    HistoryState(None)
                }
            };
            app.manage(history_state);

            // Background the startup TTL sweep (M5). On a populated 50 MB
            // store the sweep can take noticeable time; running it inline
            // here would block the setup hook and add visible latency to
            // first paint. `spawn_blocking` is the right primitive: the
            // store holds a sync `Mutex` and rusqlite calls are blocking.
            // Fire-and-forget — failures are logged inside the closure.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = app_handle.state::<HistoryState>();
                if let HistoryState(Some(ref store_ref)) = *state {
                    if let Err(e) = store_ref.ttl_sweep() {
                        eprintln!("[toolbox] history TTL sweep failed at startup: {e}");
                    }
                }
            });

            // ── Tray icon (created purely via TrayIconBuilder) ───────────
            let show_item = MenuItem::with_id(app, "show", "Show ToolBox", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit ToolBox", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

            // 44x44 retina icon decoded via Tauri's image-png feature.
            let icon = tauri::image::Image::from_bytes(
                include_bytes!("../icons/tray-icon@2x.png"),
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("ToolBox")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();

                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();

                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();

                            }
                        }
                    }
                })
                .build(app)?;

            // ── Global shortcut: Cmd+Shift+T (macOS) / Ctrl+Shift+T (others) ─
            #[cfg(target_os = "macos")]
            let modifier = Modifiers::SUPER | Modifiers::SHIFT;
            #[cfg(not(target_os = "macos"))]
            let modifier = Modifiers::CONTROL | Modifiers::SHIFT;

            let toggle_shortcut = Shortcut::new(Some(modifier), Code::KeyT);
            app.global_shortcut().on_shortcut(toggle_shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                            #[cfg(target_os = "macos")]
                            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            #[cfg(target_os = "macos")]
                            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                        }
                    }
                }
            })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let should_hide = window
                    .app_handle()
                    .path()
                    .app_data_dir()
                    .map(|dir| storage::preferences::load(&dir).minimize_to_tray)
                    .unwrap_or(true);

                if should_hide {
                    api.prevent_close();
                    let _ = window.hide();

                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Allowlist of tool ids that the history store will accept writes for.
///
/// This is the Rust-side mirror of the TypeScript tool registry and acts as
/// a defense-in-depth gate on `add_history_entry`: even if a renderer-side
/// XSS bug tried to write under a fabricated id, the IPC handler short-
/// circuits with `unknown_tool`. PR-B will replace this hardcoded list with
/// a CI-generated list derived from `src/tools/*/meta.ts`.
fn history_known_tool_ids() -> Vec<String> {
    [
        // Free + pro text-in/text-out tools that get a drawer in v1.
        "json-formatter",
        "base64",
        "url-encoder",
        "html-encoder",
        "text-cleanup",
        "lorem-ipsum",
        "word-counter",
        "color-converter",
        "color-palette",
        "number-base",
        "csv-json",
        "csv-viewer",
        "cron-parser",
        "jsonpath-eval",
        "html-preview",
        "markdown-preview",
        "sql-formatter",
        "yaml-json",
        "xml-formatter",
        "regex-tester",
        "text-diff",
        "json-to-typescript",
        "gzip-tool",
        "text-case",
        "uuid-generator",
        "timestamp-converter",
        "unix-permissions",
        "epoch-batch",
        // Sensitive-content tools still need to appear here so the IPC
        // accepts the write and the store can convert it to a tombstone
        // (defense-in-depth). Otherwise we'd silently drop with
        // `unknown_tool` instead of leaving the audit trail.
        "password-gen",
        "password-checker",
        "hash-generator",
        "jwt-decoder",
        "backslash-escape",
        "paycheck",
        "tax-bracket",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}
