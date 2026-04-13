//! Shared input validators.
//!
//! Every command that accepts user-controlled input MUST run it through one
//! of these validators before performing any side effect. The validators are
//! intentionally strict and conservative — false positives are preferable to
//! false negatives at the trust boundary.
//!
//! Path validation is defense-in-depth: the Tauri capability system is the
//! primary scope-gate, but a renderer-side XSS bug or a malicious dependency
//! could still ask the Rust side to read `/etc/passwd`. `validate_*_file_path`
//! canonicalizes first, then matches against a hard-coded deny list of
//! platform-specific sensitive prefixes. The returned `PathBuf` is the
//! canonical form — callers MUST use it instead of the original string so
//! there is no TOCTOU window between validation and the real filesystem call.

use std::path::{Component, Path, PathBuf};

const MAX_PATH_LEN: usize = 4096;
const MAX_BOUNDED_STRING_LEN: usize = 8 * 1024;

const ALLOWED_PROVIDERS: &[&str] = &["openai", "anthropic", "google"];

/// Paths whose canonical form starts with one of these prefixes is refused
/// for both reads and writes. We keep the list conservative: a general
/// utility app has no business touching any of these on any platform.
#[cfg(unix)]
const FORBIDDEN_PREFIXES: &[&str] = &[
    "/etc/",
    "/private/etc/",
    "/System/",
    "/usr/",
    "/bin/",
    "/sbin/",
    "/dev/",
    "/proc/",
];

#[cfg(windows)]
const FORBIDDEN_PREFIXES: &[&str] = &[
    "C:\\Windows\\",
    "C:\\Program Files\\",
    "C:\\Program Files (x86)\\",
];

/// Basename that must never be a write target — this is where we persist
/// user preferences, and a renderer that can rewrite it out-of-band would
/// bypass the `set_preferences` validation layer entirely.
const RESERVED_BASENAMES: &[&str] = &["preferences.json", "preferences.json.bad"];

/// Path shape check used by every file-path validator. Kept private — the
/// public API always returns a canonicalized `PathBuf`.
fn check_path_shape(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("invalid file path".to_string());
    }
    if path.len() > MAX_PATH_LEN {
        return Err("invalid file path".to_string());
    }
    // NUL bytes are never legal in OS paths and are a classic injection vector.
    if path.contains('\0') {
        return Err("invalid file path".to_string());
    }
    Ok(())
}

/// True iff the canonical form of `path` lives under one of the forbidden
/// system directories for the current platform.
fn is_forbidden_prefix(path: &Path) -> bool {
    let s = path.to_string_lossy();
    FORBIDDEN_PREFIXES
        .iter()
        .any(|prefix| s.starts_with(prefix))
}

/// True iff `path`'s basename is on the reserved list (e.g. `preferences.json`).
fn has_reserved_basename(path: &Path) -> bool {
    match path.file_name().and_then(|n| n.to_str()) {
        Some(name) => RESERVED_BASENAMES.contains(&name),
        None => false,
    }
}

/// True iff the path contains any `..` or `.` components. Canonicalization
/// normally strips these, but we double-check because a canonicalize call
/// against a symlinked-but-not-yet-existing parent can sometimes surface
/// intermediate components on exotic filesystems.
fn has_relative_components(path: &Path) -> bool {
    path.components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
}

/// Validate a path that must already exist and must be a regular file.
/// Used by read/stat/hash commands.
///
/// On success returns the canonicalized `PathBuf`; callers MUST use that
/// instead of the original input to avoid TOCTOU between validation and
/// the filesystem call. All rejection paths return a generic
/// "invalid file path" / "path is not allowed" string — we never echo the
/// canonicalized location back to the renderer.
pub fn validate_existing_file_path(path: &str) -> Result<PathBuf, String> {
    check_path_shape(path)?;

    let canonical = std::fs::canonicalize(Path::new(path))
        .map_err(|_| "invalid file path".to_string())?;

    if has_relative_components(&canonical) {
        return Err("invalid file path".to_string());
    }
    if is_forbidden_prefix(&canonical) {
        return Err("path is not allowed".to_string());
    }
    if has_reserved_basename(&canonical) {
        return Err("path is not allowed".to_string());
    }

    Ok(canonical)
}

/// Validate a path that will be written to. The target file itself may not
/// exist yet, so we canonicalize the PARENT directory and rejoin the
/// basename. The parent must exist — callers are expected to create the
/// parent tree separately if needed (none of our current callers do).
///
/// Same rejection semantics as `validate_existing_file_path`.
pub fn validate_writable_file_path(path: &str) -> Result<PathBuf, String> {
    check_path_shape(path)?;

    let candidate = Path::new(path);

    let file_name = candidate
        .file_name()
        .ok_or_else(|| "invalid file path".to_string())?
        .to_owned();

    // Reject reserved basenames BEFORE touching the filesystem so we fail
    // fast and never leak whether the directory exists.
    if let Some(name) = file_name.to_str() {
        if RESERVED_BASENAMES.contains(&name) {
            return Err("path is not allowed".to_string());
        }
    }

    let parent = candidate
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "invalid file path".to_string())?;

    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|_| "invalid file path".to_string())?;

    let canonical = canonical_parent.join(&file_name);

    if has_relative_components(&canonical) {
        return Err("invalid file path".to_string());
    }
    if is_forbidden_prefix(&canonical) {
        return Err("path is not allowed".to_string());
    }
    if has_reserved_basename(&canonical) {
        return Err("path is not allowed".to_string());
    }

    Ok(canonical)
}

/// Validate that a provider identifier is on the allowlist.
pub fn validate_provider_name(provider: &str) -> Result<(), String> {
    if ALLOWED_PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!(
            "unknown provider '{provider}'; allowed: {}",
            ALLOWED_PROVIDERS.join(", ")
        ))
    }
}

/// Validate a generic bounded string used for user-supplied content. Rejects
/// empty strings (caller can opt out by checking emptiness themselves) and
/// anything longer than the bound.
#[allow(dead_code)]
pub fn bounded_string(value: &str, max_len: usize) -> Result<(), String> {
    if value.is_empty() {
        return Err("value must not be empty".to_string());
    }
    let limit = max_len.min(MAX_BOUNDED_STRING_LEN);
    if value.len() > limit {
        return Err(format!("value exceeds max length ({limit} chars)"));
    }
    if value.contains('\0') {
        return Err("value contains NUL byte".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_existing_file_path_accepts_real_file() {
        // Cargo.toml is guaranteed to exist at the crate root when tests run.
        let result = validate_existing_file_path("Cargo.toml");
        assert!(
            result.is_ok(),
            "expected Cargo.toml to validate, got {result:?}"
        );
        let canonical = result.unwrap();
        assert!(canonical.is_absolute(), "canonicalized path should be absolute");
        assert!(canonical.ends_with("Cargo.toml"));
    }

    #[cfg(unix)]
    #[test]
    fn validate_existing_file_path_rejects_etc_passwd() {
        // /etc/passwd exists on every Unix, and /etc is on the deny list.
        let result = validate_existing_file_path("/etc/passwd");
        assert!(result.is_err(), "expected /etc/passwd to be rejected");
        let msg = result.unwrap_err();
        assert!(
            msg == "path is not allowed" || msg == "invalid file path",
            "unexpected error message: {msg}"
        );
    }

    #[test]
    fn validate_existing_file_path_rejects_nul_byte() {
        let result = validate_existing_file_path("Cargo.toml\0/etc/passwd");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[test]
    fn validate_existing_file_path_rejects_over_length_limit() {
        let long_path = "a".repeat(MAX_PATH_LEN + 1);
        let result = validate_existing_file_path(&long_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[test]
    fn validate_existing_file_path_rejects_empty_string() {
        let result = validate_existing_file_path("");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[test]
    fn validate_existing_file_path_rejects_nonexistent_file() {
        let result = validate_existing_file_path("/definitely/not/a/real/path/xyzzy.txt");
        assert!(result.is_err());
        // Could be either "invalid file path" (canonicalize failed) — we
        // never leak the specific reason.
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[test]
    fn validate_writable_file_path_rejects_preferences_json() {
        // Parent (the crate root) exists, target doesn't need to.
        let result = validate_writable_file_path("preferences.json");
        assert!(result.is_err(), "preferences.json write must be rejected");
        assert_eq!(result.unwrap_err(), "path is not allowed");
    }

    #[test]
    fn validate_writable_file_path_rejects_parentless_path() {
        // A bare filename has parent `""`, which we reject so the caller is
        // forced to pass an absolute or explicitly-relative path.
        let result = validate_writable_file_path("/");
        assert!(result.is_err());
    }

    #[test]
    fn validate_writable_file_path_rejects_bare_filename() {
        // A bare filename like "foo.txt" has parent "" which the filter
        // rejects — callers must use an absolute or explicitly-relative path.
        let result = validate_writable_file_path("foo.txt");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[test]
    fn validate_writable_file_path_rejects_nul_byte() {
        let result = validate_writable_file_path("/tmp/foo\0bar.txt");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "invalid file path");
    }

    #[cfg(unix)]
    #[test]
    fn validate_writable_file_path_rejects_etc_target() {
        // The parent `/etc` exists and canonicalizes; the deny list catches it.
        let result = validate_writable_file_path("/etc/malicious.conf");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "path is not allowed");
    }
}
