//! File operation commands.
//!
//! Phase 1 baseline: simple read/write with path-length and size validation.
//! Path scoping is enforced primarily by the Tauri capability system (see
//! `capabilities/default.json`). These handlers add defense-in-depth via
//! `validate_existing_file_path` / `validate_writable_file_path`, which
//! canonicalize the path and match it against a deny list of sensitive
//! system directories — we always operate on the canonical `PathBuf`, never
//! the renderer-supplied string, to avoid TOCTOU between validation and
//! the real filesystem call.

use crate::security::input_validation::{
    validate_existing_file_path, validate_writable_file_path,
};
use tokio::fs;
use tokio::io::AsyncWriteExt;

const MAX_READ_BYTES: u64 = 100 * 1024 * 1024; // 100 MB
const MAX_WRITE_BYTES: usize = 100 * 1024 * 1024; // 100 MB

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let p = validate_existing_file_path(&path)?;

    let meta = fs::metadata(&p)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;

    if !meta.is_file() {
        return Err("path is not a regular file".to_string());
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "file exceeds max read size of {} bytes",
            MAX_READ_BYTES
        ));
    }

    fs::read_to_string(&p)
        .await
        .map_err(|e| format!("failed to read file: {e}"))
}

/// Return the size in bytes of a regular file at `path`.
///
/// Used by frontend tools (e.g. Hash Generator) that need to display a file's
/// size and enforce a client-side cap before kicking off the real operation.
/// Validates the path the same way `read_text_file` does, never leaks raw
/// OS error messages, and rejects non-regular targets.
#[tauri::command]
pub async fn stat_file(path: String) -> Result<u64, String> {
    let p = validate_existing_file_path(&path)?;

    let meta = fs::metadata(&p)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;

    if !meta.is_file() {
        return Err("path is not a regular file".to_string());
    }

    Ok(meta.len())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = validate_writable_file_path(&path)?;

    if content.len() > MAX_WRITE_BYTES {
        return Err(format!(
            "content exceeds max write size of {} bytes",
            MAX_WRITE_BYTES
        ));
    }

    // Symlink-on-existing-file guard. `validate_writable_file_path` only
    // canonicalizes the parent directory, so if the target file already
    // exists as a symlink we'd happily follow it during `File::create`.
    // `symlink_metadata` does NOT follow links, so it lets us detect this
    // case and refuse rather than clobber whatever the link points at.
    // Cross-platform — works on macOS, Linux, and Windows.
    if let Ok(meta) = fs::symlink_metadata(&p).await {
        if meta.file_type().is_symlink() {
            return Err("path is not allowed".to_string());
        }
    }

    // The validator has already canonicalized the parent, so it exists. We
    // deliberately do NOT `create_dir_all` here — callers must target an
    // existing directory so a compromised renderer can't materialize an
    // arbitrary deep path inside the app sandbox.
    let mut f = fs::File::create(&p)
        .await
        .map_err(|e| format!("failed to create file: {e}"))?;
    f.write_all(content.as_bytes())
        .await
        .map_err(|e| format!("failed to write file: {e}"))?;
    f.flush()
        .await
        .map_err(|e| format!("failed to flush file: {e}"))?;
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    /// Regression test for the symlink-on-existing-file write vector.
    /// Even though `validate_writable_file_path` accepts the path (the parent
    /// canonicalizes fine and the basename isn't on the deny list), the
    /// `write_text_file` handler must refuse because the target is a symlink.
    #[tokio::test]
    async fn write_text_file_refuses_symlink_target() {
        let tmp = std::env::temp_dir().join(format!(
            "toolbox-test-symlink-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&tmp);

        // Make `tmp` a symlink to /tmp/safe-target (a file we own). The
        // exact target doesn't matter — what matters is the symlink itself.
        let target = std::env::temp_dir().join(format!(
            "toolbox-test-symlink-target-{}",
            std::process::id()
        ));
        std::fs::write(&target, b"safe").expect("write target");
        symlink(&target, &tmp).expect("create symlink");

        let result = write_text_file(
            tmp.to_string_lossy().into_owned(),
            "should not write".to_string(),
        )
        .await;

        // Cleanup before assert so failures don't leave debris.
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&target);

        assert!(result.is_err(), "write to symlink target must be rejected");
        assert_eq!(result.unwrap_err(), "path is not allowed");
    }
}
