//! Image processing commands.
//!
//! All operations use the Rust `image` crate ecosystem (MIT / Apache 2.0)
//! compiled directly into the Tauri binary. No sidecar, no licensing risk.
//!
//! Every command validates its inputs (path canonicalization, size limits,
//! format allowlist) before performing any work. File paths go through the
//! same `validate_existing_file_path` / `validate_writable_file_path` used
//! by the rest of the backend.

use crate::security::input_validation::{validate_existing_file_path, validate_writable_file_path};
use image::imageops::FilterType;
use image::ImageFormat;
use serde::Serialize;
use std::path::Path;

const MAX_IMAGE_BYTES: u64 = 100 * 1024 * 1024; // 100 MB

const ALLOWED_FORMATS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "ico",
];

fn parse_format(ext: &str) -> Result<ImageFormat, String> {
    match ext.to_lowercase().as_str() {
        "png" => Ok(ImageFormat::Png),
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        "bmp" => Ok(ImageFormat::Bmp),
        "gif" => Ok(ImageFormat::Gif),
        "tiff" | "tif" => Ok(ImageFormat::Tiff),
        "ico" => Ok(ImageFormat::Ico),
        _ => Err(format!(
            "unsupported format '{ext}'; allowed: {}",
            ALLOWED_FORMATS.join(", ")
        )),
    }
}

/// Save an image using the best available encoder for each format:
/// - JPEG: mozjpeg (optimal Huffman + trellis quantization, 10-30% smaller than basic)
/// - PNG: image crate save → oxipng lossless recompression (10-50% smaller)
/// - Other formats: image crate's built-in encoder (adequate for BMP/GIF/WebP/TIFF/ICO)
fn save_best(
    img: &image::DynamicImage,
    dst: &Path,
    format: ImageFormat,
    jpeg_quality: u8,
) -> Result<(), String> {
    match format {
        ImageFormat::Jpeg => {
            let rgb = img.to_rgb8();
            let (w, h) = (rgb.width() as usize, rgb.height() as usize);
            let pixels = rgb.into_raw();
            let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
            comp.set_size(w, h);
            comp.set_quality(jpeg_quality as f32);
            comp.set_optimize_coding(true);
            let mut comp = comp
                .start_compress(Vec::new())
                .map_err(|e| format!("mozjpeg init failed: {e}"))?;
            comp.write_scanlines(&pixels)
                .map_err(|e| format!("mozjpeg encode failed: {e}"))?;
            let jpeg_bytes = comp
                .finish()
                .map_err(|e| format!("mozjpeg finish failed: {e}"))?;
            std::fs::write(dst, &jpeg_bytes)
                .map_err(|e| format!("failed to write JPEG: {e}"))?;
        }
        ImageFormat::Png => {
            // First: save a baseline PNG via the image crate.
            img.save_with_format(dst, ImageFormat::Png)
                .map_err(|e| format!("failed to save PNG: {e}"))?;
            // Then: run oxipng for lossless recompression. This applies
            // zlib/zopfli-level deflate that the basic encoder doesn't,
            // typically reducing PNG size by 10-50%.
            let raw = std::fs::read(dst)
                .map_err(|e| format!("failed to read PNG for optimization: {e}"))?;
            let opts = oxipng::Options {
                // Level 3 is a good balance of speed vs compression.
                // Level 6 (max) is slower but only marginally better.
                ..oxipng::Options::from_preset(3)
            };
            match oxipng::optimize_from_memory(&raw, &opts) {
                Ok(optimized) => {
                    std::fs::write(dst, &optimized)
                        .map_err(|e| format!("failed to write optimized PNG: {e}"))?;
                }
                Err(_) => {
                    // If oxipng fails (rare — corrupt PNG header), keep the
                    // baseline. Don't crash.
                }
            }
        }
        _ => {
            img.save_with_format(dst, format)
                .map_err(|e| format!("failed to save image: {e}"))?;
        }
    }
    Ok(())
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("width and height must be positive".to_string());
    }
    if width > 16384 || height > 16384 {
        return Err("dimensions must not exceed 16384 pixels".to_string());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: u64,
}

/// Get basic info about an image file (dimensions, format, size).
#[tauri::command]
pub async fn get_image_info(path: String) -> Result<ImageInfo, String> {
    let p = validate_existing_file_path(&path)?;
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;
    if !meta.is_file() {
        return Err("path is not a regular file".to_string());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds max size of 100 MB".to_string());
    }

    let img = tokio::task::spawn_blocking(move || image::open(&p))
        .await
        .map_err(|e| format!("task failed: {e}"))?
        .map_err(|e| format!("failed to open image: {e}"))?;

    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown");

    Ok(ImageInfo {
        width: img.width(),
        height: img.height(),
        format: ext.to_lowercase(),
        size_bytes: meta.len(),
    })
}

/// Resize an image and save to the output path.
#[tauri::command]
pub async fn resize_image(
    input_path: String,
    output_path: String,
    width: u32,
    height: u32,
    maintain_aspect: bool,
) -> Result<ImageInfo, String> {
    let src = validate_existing_file_path(&input_path)?;
    let dst = validate_writable_file_path(&output_path)?;
    validate_dimensions(width, height)?;

    let meta = tokio::fs::metadata(&src)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds max size of 100 MB".to_string());
    }

    let out_ext = dst
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "output path must have a file extension".to_string())?
        .to_lowercase();
    let out_format = parse_format(&out_ext)?;

    let result = tokio::task::spawn_blocking(move || -> Result<ImageInfo, String> {
        let img = image::open(&src).map_err(|e| format!("failed to open image: {e}"))?;

        let resized = if maintain_aspect {
            img.resize(width, height, FilterType::Lanczos3)
        } else {
            img.resize_exact(width, height, FilterType::Lanczos3)
        };

        let (rw, rh) = (resized.width(), resized.height());
        save_best(&resized, &dst, out_format, 85)?;

        let out_meta = std::fs::metadata(&dst)
            .map_err(|e| format!("failed to stat output: {e}"))?;

        Ok(ImageInfo {
            width: rw,
            height: rh,
            format: out_ext,
            size_bytes: out_meta.len(),
        })
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?;

    result
}

/// Convert an image from one format to another.
#[tauri::command]
pub async fn convert_image(
    input_path: String,
    output_path: String,
    quality: Option<u8>,
) -> Result<ImageInfo, String> {
    let src = validate_existing_file_path(&input_path)?;
    let dst = validate_writable_file_path(&output_path)?;

    let meta = tokio::fs::metadata(&src)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds max size of 100 MB".to_string());
    }

    let out_ext = dst
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "output path must have a file extension".to_string())?
        .to_lowercase();
    let out_format = parse_format(&out_ext)?;

    let quality = quality.unwrap_or(85).min(100);

    let result = tokio::task::spawn_blocking(move || -> Result<ImageInfo, String> {
        let img = image::open(&src).map_err(|e| format!("failed to open image: {e}"))?;

        save_best(&img, &dst, out_format, quality)?;

        let out_meta =
            std::fs::metadata(&dst).map_err(|e| format!("failed to stat output: {e}"))?;

        Ok(ImageInfo {
            width: img.width(),
            height: img.height(),
            format: out_ext,
            size_bytes: out_meta.len(),
        })
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?;

    result
}

/// Strip EXIF metadata from an image by re-encoding it.
/// The simplest safe approach: decode → re-encode. The image crate's
/// encoder never copies EXIF data, so the output is clean.
#[tauri::command]
pub async fn strip_exif(input_path: String, output_path: String) -> Result<ImageInfo, String> {
    // Re-encoding via convert_image inherently strips EXIF since the
    // image crate's encoders don't preserve metadata blocks.
    convert_image(input_path, output_path, None).await
}

/// Read EXIF metadata from an image.
#[tauri::command]
pub async fn read_exif(path: String) -> Result<Vec<(String, String)>, String> {
    let p = validate_existing_file_path(&path)?;
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("failed to stat file: {e}"))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds max size of 100 MB".to_string());
    }

    tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>, String> {
        let file =
            std::fs::File::open(&p).map_err(|e| format!("failed to open file: {e}"))?;
        let mut reader = std::io::BufReader::new(file);
        let exif = exif::Reader::new()
            .read_from_container(&mut reader)
            .map_err(|e| format!("no EXIF data found: {e}"))?;

        let entries: Vec<(String, String)> = exif
            .fields()
            .map(|f| {
                (
                    f.tag.to_string(),
                    f.display_value().with_unit(&exif).to_string(),
                )
            })
            .collect();

        Ok(entries)
    })
    .await
    .map_err(|e| format!("task failed: {e}"))
    .and_then(|r| r)
}
