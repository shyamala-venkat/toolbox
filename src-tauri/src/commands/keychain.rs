//! OS keychain commands for storing third-party API keys.
//!
//! Security notes:
//! - The provider is validated against an allowlist before any keychain call,
//!   so callers cannot pivot the keychain into an arbitrary credential store.
//! - The key value is NEVER logged. Errors only mention the provider name.
//! - Keychain service name is fixed to the app identifier.

use crate::security::input_validation::validate_provider_name;
use serde::Serialize;

const SERVICE_NAME: &str = "com.toolbox.app";

/// Non-sensitive summary of a stored API key.
///
/// Used by the settings UI to show "configured — ends in …abcd" without
/// shipping the raw secret across the IPC boundary. `last_four` is `None`
/// exactly when `has_key` is `false`, except for the degenerate case of a
/// sub-4-character key (in practice never happens for real provider keys,
/// but handled defensively by returning the whole key).
#[derive(Debug, Serialize)]
pub struct ApiKeySummary {
    pub has_key: bool,
    pub last_four: Option<String>,
}

fn entry_for(provider: &str) -> Result<keyring::Entry, String> {
    validate_provider_name(provider)?;
    keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| format!("keychain entry init failed for provider '{provider}': {e}"))
}

#[tauri::command]
pub fn store_api_key(provider: String, key: String) -> Result<(), String> {
    if key.is_empty() {
        return Err("api key must not be empty".to_string());
    }
    if key.len() > 4096 {
        return Err("api key exceeds maximum length (4096)".to_string());
    }
    let entry = entry_for(&provider)?;
    entry
        .set_password(&key)
        .map_err(|e| format!("failed to store key for provider '{provider}': {e}"))
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = entry_for(&provider)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read key for provider '{provider}': {e}")),
    }
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = entry_for(&provider)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to delete key for provider '{provider}': {e}")),
    }
}

/// Return a non-sensitive summary of the stored key for `provider`.
///
/// This command exists so the settings UI can render "configured — ends in
/// …abcd" without the raw secret ever entering the renderer process (where
/// React DevTools, heap dumps, or a renderer-side XSS bug could otherwise
/// exfiltrate it). The full key is only exposed via `get_api_key`, which the
/// UI calls on an explicit "Reveal" action.
///
/// Security notes:
/// - The key is read into a local and dropped immediately after the suffix is
///   computed; it is never cloned, never logged, and never placed in error
///   strings.
/// - `last_four` is char-based so a multi-byte UTF-8 key cannot produce an
///   invalid slice panic, even though real provider keys are ASCII.
/// - On any keyring error we return a generic reason without echoing the key.
#[tauri::command]
pub fn get_api_key_summary(provider: String) -> Result<ApiKeySummary, String> {
    let entry = entry_for(&provider)?;
    match entry.get_password() {
        Ok(key) => {
            // Compute the suffix inside a block so the full secret is
            // guaranteed to drop before we build the response, minimising
            // the window in which it lives in this process's memory.
            let last_four = {
                let char_count = key.chars().count();
                let suffix = if char_count == 0 {
                    None
                } else if char_count < 4 {
                    Some(key.chars().collect::<String>())
                } else {
                    Some(key.chars().skip(char_count - 4).collect::<String>())
                };
                drop(key);
                suffix
            };
            Ok(ApiKeySummary {
                has_key: true,
                last_four,
            })
        }
        Err(keyring::Error::NoEntry) => Ok(ApiKeySummary {
            has_key: false,
            last_four: None,
        }),
        Err(e) => Err(format!(
            "failed to read key summary for provider '{provider}': {e}"
        )),
    }
}
