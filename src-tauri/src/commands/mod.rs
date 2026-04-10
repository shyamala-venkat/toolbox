//! Command modules. Each submodule owns a single capability surface and
//! exposes `#[tauri::command]` functions that are wired in `lib.rs`.

pub mod crypto;
pub mod file_ops;
pub mod image_ops;
pub mod keychain;
pub mod preferences;
pub mod system;
