//! Cryptographic hashing commands.
//!
//! Streams the file in 64 KiB chunks so we never load large files fully into
//! memory. Algorithm names are validated against an allowlist before dispatch.

use crate::security::input_validation::validate_existing_file_path;
use md5::{Digest as Md5Digest, Md5};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, BufReader};

const CHUNK_SIZE: usize = 64 * 1024;
const ALLOWED_ALGORITHMS: &[&str] = &["md5", "sha1", "sha256", "sha512", "crc32"];
/// Cap for text-mode hashing. Mirrors the spirit of the file-mode chunking
/// limits — text crosses the IPC boundary as a single allocation, so an
/// arbitrarily large blob would let a malicious caller balloon memory usage.
/// 10 MiB is comfortably above any realistic "paste this string" use case.
const MAX_HASH_TEXT_BYTES: usize = 10 * 1024 * 1024;
/// Cap for file-mode hashing. Even though we stream in 64 KiB chunks, we still
/// reject anything above 100 MiB up-front: hashing a 50 GiB file from a tool
/// that's supposed to be interactive is almost always a bug or an abuse vector.
/// The frontend mirrors this limit so users get a friendly toast before the
/// IPC round-trip.
const MAX_HASH_FILE_BYTES: u64 = 100 * 1024 * 1024;

fn validate_algorithm(algorithm: &str) -> Result<(), String> {
    if ALLOWED_ALGORITHMS.contains(&algorithm) {
        Ok(())
    } else {
        Err(format!(
            "unsupported algorithm '{algorithm}'; allowed: {}",
            ALLOWED_ALGORITHMS.join(", ")
        ))
    }
}

#[tauri::command]
pub async fn hash_file(path: String, algorithm: String) -> Result<String, String> {
    validate_algorithm(&algorithm)?;
    // Canonicalizes + rejects forbidden prefixes (/etc, /System, /usr, ...).
    // Returns an absolute `PathBuf` we can safely trust for the rest of the
    // handler.
    let p = validate_existing_file_path(&path)?;

    // Stat the canonical path BEFORE opening. canonicalize() succeeds on
    // directories too, so we still need the is_file() check. The size cap is
    // enforced up-front so we never hold an open handle on an abusively-large
    // file.
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;
    if !meta.is_file() {
        return Err("path is not a regular file".to_string());
    }
    if meta.len() > MAX_HASH_FILE_BYTES {
        return Err("file exceeds max hash size of 100 MB".to_string());
    }

    let file = File::open(&p)
        .await
        .map_err(|e| format!("failed to open file: {e}"))?;
    let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);
    let mut buf = vec![0u8; CHUNK_SIZE];

    match algorithm.as_str() {
        "md5" => {
            let mut hasher = Md5::new();
            loop {
                let n = reader
                    .read(&mut buf)
                    .await
                    .map_err(|e| format!("read error: {e}"))?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        "sha1" => {
            let mut hasher = Sha1::new();
            loop {
                let n = reader
                    .read(&mut buf)
                    .await
                    .map_err(|e| format!("read error: {e}"))?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        "sha256" => {
            let mut hasher = Sha256::new();
            loop {
                let n = reader
                    .read(&mut buf)
                    .await
                    .map_err(|e| format!("read error: {e}"))?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        "sha512" => {
            let mut hasher = Sha512::new();
            loop {
                let n = reader
                    .read(&mut buf)
                    .await
                    .map_err(|e| format!("read error: {e}"))?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        "crc32" => {
            let mut hasher = crc32fast::Hasher::new();
            loop {
                let n = reader
                    .read(&mut buf)
                    .await
                    .map_err(|e| format!("read error: {e}"))?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:08x}", hasher.finalize()))
        }
        _ => unreachable!("validated above"),
    }
}

/// Hash an in-memory text payload. Used by the Hash Generator's text mode.
///
/// Notes:
///   - Input bytes are NEVER logged or echoed in error messages.
///   - The text payload is hard-capped at 10 MiB to prevent IPC-side memory
///     exhaustion. Above that, callers should switch to file mode.
///   - Empty strings are accepted: hashing the empty string is a well-defined
///     operation and matches what `sha256sum < /dev/null` returns.
#[tauri::command]
pub async fn hash_text(text: String, algorithm: String) -> Result<String, String> {
    validate_algorithm(&algorithm)?;

    if text.len() > MAX_HASH_TEXT_BYTES {
        return Err(format!(
            "text exceeds max length ({} bytes); use file mode for larger inputs",
            MAX_HASH_TEXT_BYTES
        ));
    }

    let bytes = text.as_bytes();

    let digest = match algorithm.as_str() {
        "md5" => {
            let mut hasher = Md5::new();
            hasher.update(bytes);
            format!("{:x}", hasher.finalize())
        }
        "sha1" => {
            let mut hasher = Sha1::new();
            hasher.update(bytes);
            format!("{:x}", hasher.finalize())
        }
        "sha256" => {
            let mut hasher = Sha256::new();
            hasher.update(bytes);
            format!("{:x}", hasher.finalize())
        }
        "sha512" => {
            let mut hasher = Sha512::new();
            hasher.update(bytes);
            format!("{:x}", hasher.finalize())
        }
        "crc32" => {
            let mut hasher = crc32fast::Hasher::new();
            hasher.update(bytes);
            format!("{:08x}", hasher.finalize())
        }
        _ => unreachable!("validated above"),
    };

    Ok(digest)
}
