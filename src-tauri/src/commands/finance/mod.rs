//! Finance dataset IPC commands.
//!
//! Owns the read/write surface for the bundled-or-overlay JSON snapshots that
//! drive the Finance Calculator Pack:
//!   * `fx-usd`  — Federal Reserve H.10 USD-base FX snapshot
//!   * `tax-fed` — IRS federal tax tables for one tax year
//!
//! Conventions copied from `commands/preferences.rs`:
//!   1. Resolve `app_data_dir` from the Tauri `AppHandle`.
//!   2. Validate every field on the Rust side before persisting.
//!   3. Atomic writes via `<path>.tmp` + `rename`.
//!   4. On read, a corrupted overlay is renamed to `<name>.json.bad` and the
//!      caller silently falls back to the bundled snapshot.
//!   5. Error strings never echo user input — they describe the failure mode.

pub mod validators;

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

use validators::{
    validate_currency_code, validate_finite_positive, validate_iso_date_freshness,
    validate_tax_year,
};

/// Hard cap on imported snapshot JSON. 64 KB is generous: the bundled FX
/// snapshot is <2 KB, the bundled tax snapshot is <3 KB. Anything larger is
/// either malicious or wrong-shape.
const MAX_SNAPSHOT_BYTES: usize = 64 * 1024;

/// Maximum age for an FX snapshot. Beyond this the H.10 release is too stale
/// to import — we'd rather refuse than enshrine bad data.
const FX_MAX_AGE_DAYS: i64 = 60;

/// Minimum number of currencies an FX snapshot must contain. Catches truncated
/// pastes that happen to start with a valid prefix.
const FX_MIN_CURRENCIES: usize = 5;

/// Sanity ceiling for any standard-deduction value. Federal standard deductions
/// are well under $100k; 1e6 is a comfortable upper bound.
const TAX_STANDARD_DEDUCTION_MAX: f64 = 1_000_000.0;

/// Allowlist of dataset names that the frontend may request or reset. Anything
/// else is rejected before it reaches a filesystem operation.
const ALLOWED_DATASETS: &[&str] = &["fx-usd", "tax-fed"];

const FX_DATASET: &str = "fx-usd";
const TAX_DATASET: &str = "tax-fed";

/// Public response wrapper around a dataset read.
///
/// `serde(rename_all = "camelCase")` matches the frontend's TypeScript types
/// in `src/lib/tauri.ts` (`asOf`, `taxYear`). Without this, the frontend would
/// see `as_of` / `tax_year` and silently observe `undefined` for the renamed
/// field — a P0 contract drift. Other Rust commands in this project keep
/// snake_case (e.g. `ApiKeySummary.has_key`) and have matching snake_case in
/// `tauri.ts`; the finance frontend was written camelCase first, so we align
/// the wire format with the frontend rather than churn the TS callers.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceDatasetResponse {
    pub kind: String,
    pub data: serde_json::Value,
    pub source: String,
    pub as_of: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FxImportResult {
    pub as_of: String,
    pub currencies: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxImportResult {
    pub tax_year: u32,
}

// ── Path helpers ─────────────────────────────────────────────────────────

fn validate_dataset_name(name: &str) -> Result<(), String> {
    if !ALLOWED_DATASETS.contains(&name) {
        return Err("unknown dataset name".to_string());
    }
    Ok(())
}

fn dataset_kind(name: &str) -> &'static str {
    match name {
        FX_DATASET => "fx",
        TAX_DATASET => "tax",
        // Already gated by `validate_dataset_name`. Returning a placeholder
        // here keeps the function infallible without a panic.
        _ => "unknown",
    }
}

fn overlay_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("finance")
}

fn overlay_path(app_data_dir: &Path, name: &str) -> PathBuf {
    overlay_dir(app_data_dir).join(format!("{name}.json"))
}

fn resolve_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))
}

fn resolve_resource_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {e}"))
}

// ── Snapshot extractors (work on parsed JSON) ────────────────────────────

fn extract_fx_as_of(value: &serde_json::Value) -> String {
    value
        .get("asOf")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn extract_tax_year(value: &serde_json::Value) -> String {
    match value.get("taxYear").and_then(|v| v.as_u64()) {
        Some(y) => format!("TY{y}"),
        None => String::new(),
    }
}

fn dataset_as_of_label(name: &str, value: &serde_json::Value) -> String {
    match name {
        FX_DATASET => extract_fx_as_of(value),
        TAX_DATASET => extract_tax_year(value),
        _ => String::new(),
    }
}

// ── Read: overlay-or-bundled with corrupted-overlay quarantine ───────────

/// Read the overlay from `app_data_dir/finance/{name}.json` if it exists and
/// parses. On parse failure, rename to `<name>.json.bad` and return None so
/// the caller falls back to bundled.
fn read_overlay(app_data_dir: &Path, name: &str) -> Option<serde_json::Value> {
    let path = overlay_path(app_data_dir, name);
    let bytes = std::fs::read(&path).ok()?;
    match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(v) => Some(v),
        Err(err) => {
            let bad = path.with_extension("json.bad");
            eprintln!(
                "[toolbox] finance overlay '{name}' failed to parse: {err}; quarantining and falling back to bundled"
            );
            if let Err(rename_err) = std::fs::rename(&path, &bad) {
                eprintln!("[toolbox] failed to quarantine corrupted overlay: {rename_err}");
            }
            None
        }
    }
}

fn read_bundled(resource_dir: &Path, name: &str) -> Result<serde_json::Value, String> {
    let path = resource_dir.join("resources").join("finance").join(format!("{name}.json"));
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("failed to read bundled snapshot: {e}"))?;
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .map_err(|e| format!("failed to parse bundled snapshot: {e}"))
}

/// Pure-function variant of `get_finance_dataset` that takes explicit dirs so
/// it can be unit-tested without a Tauri runtime.
fn load_dataset(
    name: &str,
    app_data_dir: &Path,
    resource_dir: &Path,
) -> Result<FinanceDatasetResponse, String> {
    validate_dataset_name(name)?;

    if let Some(overlay) = read_overlay(app_data_dir, name) {
        let as_of = dataset_as_of_label(name, &overlay);
        return Ok(FinanceDatasetResponse {
            kind: dataset_kind(name).to_string(),
            data: overlay,
            source: "overlay".to_string(),
            as_of,
        });
    }

    let bundled = read_bundled(resource_dir, name)?;
    let as_of = dataset_as_of_label(name, &bundled);
    Ok(FinanceDatasetResponse {
        kind: dataset_kind(name).to_string(),
        data: bundled,
        source: "bundled".to_string(),
        as_of,
    })
}

// ── Atomic overlay write + delete ────────────────────────────────────────

fn write_overlay(
    app_data_dir: &Path,
    name: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    let dir = overlay_dir(app_data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create finance overlay dir: {e}"))?;

    let path = overlay_path(app_data_dir, name);
    let tmp = path.with_extension("json.tmp");
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|e| format!("failed to serialize snapshot: {e}"))?;

    std::fs::write(&tmp, &bytes)
        .map_err(|e| format!("failed to write temp snapshot: {e}"))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("failed to commit snapshot: {e}"))?;
    Ok(())
}

fn delete_overlay(app_data_dir: &Path, name: &str) -> Result<(), String> {
    let path = overlay_path(app_data_dir, name);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("failed to remove overlay: {err}")),
    }
}

// ── FX import validator (pure) ────────────────────────────────────────────

/// Validates the JSON shape and field constraints for an FX snapshot. Returns
/// the parsed `serde_json::Value` plus the import result (as_of + currency
/// list). Pure — no filesystem access.
fn validate_fx_snapshot(json: &str) -> Result<(serde_json::Value, FxImportResult), String> {
    if json.len() > MAX_SNAPSHOT_BYTES {
        return Err("snapshot exceeds maximum size".to_string());
    }

    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "snapshot is not valid JSON".to_string())?;
    let obj = value
        .as_object()
        .ok_or_else(|| "snapshot must be a JSON object".to_string())?;

    let base = obj
        .get("base")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "snapshot missing 'base'".to_string())?;
    if base != "USD" {
        return Err("snapshot 'base' must be 'USD'".to_string());
    }

    let as_of = obj
        .get("asOf")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "snapshot missing 'asOf'".to_string())?;
    let (y, m, d) = validate_iso_date_freshness(as_of, FX_MAX_AGE_DAYS)?;

    let rates = obj
        .get("rates")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "snapshot missing 'rates' object".to_string())?;
    if rates.is_empty() {
        return Err("snapshot 'rates' must not be empty".to_string());
    }
    if rates.len() < FX_MIN_CURRENCIES {
        return Err("snapshot must contain at least 5 currencies".to_string());
    }

    let mut currencies: Vec<String> = Vec::with_capacity(rates.len());
    for (code, rate_value) in rates.iter() {
        validate_currency_code(code)?;
        let rate = rate_value
            .as_f64()
            .ok_or_else(|| "rate must be a number".to_string())?;
        validate_finite_positive(rate)?;
        currencies.push(code.clone());
    }
    currencies.sort();

    let canonical_as_of = format!("{y:04}-{m:02}-{d:02}");
    Ok((
        value,
        FxImportResult {
            as_of: canonical_as_of,
            currencies,
        },
    ))
}

// ── Tax import validator (pure) ───────────────────────────────────────────

const REQUIRED_FILING_STATUSES: &[&str] = &[
    "single",
    "marriedJointly",
    "marriedSeparate",
    "headOfHousehold",
];

fn validate_brackets(brackets: &serde_json::Value) -> Result<(), String> {
    let arr = brackets
        .as_array()
        .ok_or_else(|| "brackets must be an array".to_string())?;
    if arr.is_empty() {
        return Err("brackets must not be empty".to_string());
    }

    let mut prev_up_to: Option<f64> = None;
    let last_idx = arr.len() - 1;

    for (i, bracket) in arr.iter().enumerate() {
        let obj = bracket
            .as_object()
            .ok_or_else(|| "bracket must be an object".to_string())?;

        let rate = obj
            .get("rate")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "bracket missing 'rate'".to_string())?;
        if !rate.is_finite() || !(0.0..=1.0).contains(&rate) {
            return Err("bracket rate out of [0, 1]".to_string());
        }

        // `upTo` is required for all but the last bracket. The last bracket
        // may have `upTo: null` or be omitted to mean "infinity".
        let up_to_raw = obj.get("upTo");
        let is_last = i == last_idx;

        let up_to_finite: Option<f64> = match up_to_raw {
            Some(serde_json::Value::Null) | None => None,
            Some(v) => {
                let n = v
                    .as_f64()
                    .ok_or_else(|| "bracket 'upTo' must be a number or null".to_string())?;
                if !n.is_finite() || n <= 0.0 {
                    return Err("bracket 'upTo' must be finite and positive".to_string());
                }
                Some(n)
            }
        };

        match (is_last, up_to_finite) {
            (false, None) => {
                return Err("only the final bracket may have null 'upTo'".to_string());
            }
            (false, Some(n)) => {
                if let Some(prev) = prev_up_to {
                    if n <= prev {
                        return Err("brackets must be strictly ascending by 'upTo'".to_string());
                    }
                }
                prev_up_to = Some(n);
            }
            (true, _) => {
                if let (Some(prev), Some(n)) = (prev_up_to, up_to_finite) {
                    if n <= prev {
                        return Err("brackets must be strictly ascending by 'upTo'".to_string());
                    }
                }
            }
        }
    }
    Ok(())
}

fn validate_filing_status(value: &serde_json::Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "filing status must be an object".to_string())?;

    let std_ded = obj
        .get("standardDeduction")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "filing status missing 'standardDeduction'".to_string())?;
    if !std_ded.is_finite() || !(0.0..=TAX_STANDARD_DEDUCTION_MAX).contains(&std_ded) {
        return Err("standardDeduction out of range".to_string());
    }

    let brackets = obj
        .get("brackets")
        .ok_or_else(|| "filing status missing 'brackets'".to_string())?;
    validate_brackets(brackets)?;
    Ok(())
}

fn validate_fica(value: &serde_json::Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "fica must be an object".to_string())?;

    for key in [
        "socialSecurityRate",
        "medicareRate",
        "additionalMedicareRate",
    ] {
        let r = obj
            .get(key)
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "fica missing required rate".to_string())?;
        if !r.is_finite() || !(0.0..=1.0).contains(&r) {
            return Err("fica rate out of [0, 1]".to_string());
        }
    }

    let wage_base = obj
        .get("socialSecurityWageBase")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "fica missing 'socialSecurityWageBase'".to_string())?;
    validate_finite_positive(wage_base)?;

    let thresholds = obj
        .get("additionalMedicareThreshold")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "fica missing 'additionalMedicareThreshold'".to_string())?;
    for status in REQUIRED_FILING_STATUSES {
        let n = thresholds
            .get(*status)
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "fica threshold missing filing status".to_string())?;
        validate_finite_positive(n)?;
    }
    Ok(())
}

fn validate_tax_snapshot(json: &str) -> Result<(serde_json::Value, TaxImportResult), String> {
    if json.len() > MAX_SNAPSHOT_BYTES {
        return Err("snapshot exceeds maximum size".to_string());
    }

    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "snapshot is not valid JSON".to_string())?;
    let obj = value
        .as_object()
        .ok_or_else(|| "snapshot must be a JSON object".to_string())?;

    let tax_year_u64 = obj
        .get("taxYear")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "snapshot missing 'taxYear'".to_string())?;
    let tax_year_u32 =
        u32::try_from(tax_year_u64).map_err(|_| "tax year out of supported range".to_string())?;
    let tax_year = validate_tax_year(tax_year_u32)?;

    let currency = obj
        .get("currency")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "snapshot missing 'currency'".to_string())?;
    if currency != "USD" {
        return Err("snapshot 'currency' must be 'USD'".to_string());
    }

    let statuses = obj
        .get("filingStatuses")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "snapshot missing 'filingStatuses'".to_string())?;
    for required in REQUIRED_FILING_STATUSES {
        let status = statuses
            .get(*required)
            .ok_or_else(|| "snapshot missing required filing status".to_string())?;
        validate_filing_status(status)?;
    }

    let fica = obj
        .get("fica")
        .ok_or_else(|| "snapshot missing 'fica'".to_string())?;
    validate_fica(fica)?;

    Ok((value, TaxImportResult { tax_year }))
}

// ── IPC commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_finance_dataset(
    app: tauri::AppHandle,
    name: String,
) -> Result<FinanceDatasetResponse, String> {
    validate_dataset_name(&name)?;
    let app_data = resolve_app_data_dir(&app)?;
    let resources = resolve_resource_dir(&app)?;
    load_dataset(&name, &app_data, &resources)
}

#[tauri::command]
pub async fn import_fx_snapshot(
    app: tauri::AppHandle,
    json: String,
) -> Result<FxImportResult, String> {
    let (value, result) = validate_fx_snapshot(&json)?;
    let app_data = resolve_app_data_dir(&app)?;
    write_overlay(&app_data, FX_DATASET, &value)?;
    Ok(result)
}

#[tauri::command]
pub async fn import_tax_snapshot(
    app: tauri::AppHandle,
    json: String,
) -> Result<TaxImportResult, String> {
    let (value, result) = validate_tax_snapshot(&json)?;
    let app_data = resolve_app_data_dir(&app)?;
    write_overlay(&app_data, TAX_DATASET, &value)?;
    Ok(result)
}

#[tauri::command]
pub async fn reset_finance_overlay(
    app: tauri::AppHandle,
    name: String,
) -> Result<(), String> {
    validate_dataset_name(&name)?;
    let app_data = resolve_app_data_dir(&app)?;
    delete_overlay(&app_data, &name)
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Project-root resources dir, available in tests via the build-time
    /// `CARGO_MANIFEST_DIR` env var.
    fn bundled_resource_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    }

    /// Unique scratch dir under `std::env::temp_dir()` per test invocation. The
    /// dir is created lazily by callers who need it.
    fn scratch_app_data_dir(label: &str) -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("toolbox-finance-test-{label}-{nanos}-{n}"))
    }

    fn today_iso() -> String {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let days = secs.div_euclid(86_400);
        // Inline Hinnant inverse (we don't expose civil_from_days outside the
        // validators module).
        let z = days + 719_468;
        let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
        let doe = (z - era * 146_097) as u64;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
        let y = if m <= 2 { y + 1 } else { y } as i32;
        format!("{y:04}-{m:02}-{d:02}")
    }

    fn good_fx_json() -> String {
        format!(
            r#"{{
                "asOf": "{}",
                "base": "USD",
                "rates": {{
                    "EUR": 0.92, "GBP": 0.79, "JPY": 152.34, "CAD": 1.37, "AUD": 1.51, "CHF": 0.88
                }}
            }}"#,
            today_iso()
        )
    }

    fn good_tax_json() -> String {
        std::fs::read_to_string(
            bundled_resource_dir()
                .join("resources")
                .join("finance")
                .join("tax-fed.json"),
        )
        .expect("bundled tax snapshot must be readable for tests")
    }

    // Dataset name allowlist ──────────────────────────────────────────────

    #[test]
    fn dataset_name_allows_known() {
        assert!(validate_dataset_name("fx-usd").is_ok());
        assert!(validate_dataset_name("tax-fed").is_ok());
    }

    #[test]
    fn dataset_name_rejects_unknown() {
        assert!(validate_dataset_name("").is_err());
        assert!(validate_dataset_name("../../etc/passwd").is_err());
        assert!(validate_dataset_name("FX-USD").is_err());
        assert!(validate_dataset_name("fx_usd").is_err());
    }

    // FX validator ────────────────────────────────────────────────────────

    #[test]
    fn fx_accepts_known_good() {
        let (_, result) = validate_fx_snapshot(&good_fx_json()).expect("good fx must validate");
        assert_eq!(result.as_of, today_iso());
        assert!(result.currencies.contains(&"EUR".to_string()));
        // Sorted, deduped, non-empty.
        assert!(result.currencies.len() >= FX_MIN_CURRENCIES);
    }

    #[test]
    fn fx_rejects_missing_base() {
        let json = r#"{"asOf":"2026-04-15","rates":{"EUR":0.9,"GBP":0.8,"JPY":150,"CAD":1.3,"AUD":1.5}}"#;
        assert!(validate_fx_snapshot(json).is_err());
    }

    #[test]
    fn fx_rejects_non_usd_base() {
        let json = format!(
            r#"{{"asOf":"{}","base":"EUR","rates":{{"USD":1.1,"GBP":0.85,"JPY":160,"CAD":1.4,"AUD":1.6}}}}"#,
            today_iso()
        );
        assert!(validate_fx_snapshot(&json).is_err());
    }

    #[test]
    fn fx_rejects_negative_rate() {
        let json = format!(
            r#"{{"asOf":"{}","base":"USD","rates":{{"EUR":-0.92,"GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"CHF":0.88}}}}"#,
            today_iso()
        );
        assert!(validate_fx_snapshot(&json).is_err());
    }

    #[test]
    fn fx_rejects_nan_rate() {
        // NaN is not representable in JSON; serde_json rejects it. We also
        // reject any non-numeric rate value.
        let json = format!(
            r#"{{"asOf":"{}","base":"USD","rates":{{"EUR":"oops","GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"CHF":0.88}}}}"#,
            today_iso()
        );
        assert!(validate_fx_snapshot(&json).is_err());
    }

    #[test]
    fn fx_rejects_future_as_of() {
        let json = r#"{"asOf":"2099-01-01","base":"USD","rates":{"EUR":0.92,"GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"CHF":0.88}}"#;
        assert!(validate_fx_snapshot(json).is_err());
    }

    #[test]
    fn fx_rejects_too_old_as_of() {
        let json = r#"{"asOf":"2000-01-01","base":"USD","rates":{"EUR":0.92,"GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"CHF":0.88}}"#;
        assert!(validate_fx_snapshot(json).is_err());
    }

    #[test]
    fn fx_rejects_too_few_currencies() {
        let json = format!(
            r#"{{"asOf":"{}","base":"USD","rates":{{"EUR":0.92,"GBP":0.79}}}}"#,
            today_iso()
        );
        assert!(validate_fx_snapshot(&json).is_err());
    }

    #[test]
    fn fx_rejects_oversize_payload() {
        let mut filler = String::with_capacity(MAX_SNAPSHOT_BYTES + 1024);
        filler.push_str(r#"{"asOf":"2026-04-15","base":"USD","rates":{"EUR":0.92,"GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"PAD":""#);
        for _ in 0..(MAX_SNAPSHOT_BYTES + 1) {
            filler.push('a');
        }
        filler.push_str(r#""}}"#);
        assert!(validate_fx_snapshot(&filler).is_err());
    }

    #[test]
    fn fx_rejects_invalid_currency_key() {
        let json = format!(
            r#"{{"asOf":"{}","base":"USD","rates":{{"eur":0.92,"GBP":0.79,"JPY":152.34,"CAD":1.37,"AUD":1.51,"CHF":0.88}}}}"#,
            today_iso()
        );
        assert!(validate_fx_snapshot(&json).is_err());
    }

    #[test]
    fn fx_rejects_non_object_root() {
        assert!(validate_fx_snapshot("[1,2,3]").is_err());
        assert!(validate_fx_snapshot("\"hello\"").is_err());
        assert!(validate_fx_snapshot("not json").is_err());
    }

    // Tax validator ───────────────────────────────────────────────────────

    #[test]
    fn tax_accepts_bundled() {
        let (_, result) = validate_tax_snapshot(&good_tax_json()).expect("bundled tax must validate");
        assert_eq!(result.tax_year, 2025);
    }

    #[test]
    fn tax_rejects_missing_filing_status() {
        // Strip 'headOfHousehold' from the bundled snapshot.
        let v: serde_json::Value =
            serde_json::from_str(&good_tax_json()).expect("bundled snapshot is JSON");
        let mut map = v.as_object().expect("object").clone();
        let statuses = map
            .get_mut("filingStatuses")
            .and_then(|s| s.as_object_mut())
            .expect("statuses");
        statuses.remove("headOfHousehold");
        let mutated = serde_json::Value::Object(map).to_string();
        assert!(validate_tax_snapshot(&mutated).is_err());
    }

    #[test]
    fn tax_rejects_non_monotonic_brackets() {
        // Build a single-status snapshot whose brackets go backward.
        let json = r#"{
            "taxYear": 2025,
            "currency": "USD",
            "filingStatuses": {
                "single": {
                    "standardDeduction": 15000,
                    "brackets": [
                        {"upTo": 50000, "rate": 0.10},
                        {"upTo": 30000, "rate": 0.12},
                        {"upTo": null, "rate": 0.22}
                    ]
                },
                "marriedJointly": {"standardDeduction": 30000, "brackets": [{"upTo": null, "rate": 0.10}]},
                "marriedSeparate": {"standardDeduction": 15000, "brackets": [{"upTo": null, "rate": 0.10}]},
                "headOfHousehold": {"standardDeduction": 22500, "brackets": [{"upTo": null, "rate": 0.10}]}
            },
            "fica": {
                "socialSecurityRate": 0.062,
                "socialSecurityWageBase": 176100,
                "medicareRate": 0.0145,
                "additionalMedicareRate": 0.009,
                "additionalMedicareThreshold": {
                    "single": 200000, "marriedJointly": 250000,
                    "marriedSeparate": 125000, "headOfHousehold": 200000
                }
            }
        }"#;
        assert!(validate_tax_snapshot(json).is_err());
    }

    #[test]
    fn tax_rejects_rate_out_of_range() {
        let json = r#"{
            "taxYear": 2025,
            "currency": "USD",
            "filingStatuses": {
                "single": {
                    "standardDeduction": 15000,
                    "brackets": [
                        {"upTo": 50000, "rate": 1.5},
                        {"upTo": null, "rate": 0.22}
                    ]
                },
                "marriedJointly": {"standardDeduction": 30000, "brackets": [{"upTo": null, "rate": 0.10}]},
                "marriedSeparate": {"standardDeduction": 15000, "brackets": [{"upTo": null, "rate": 0.10}]},
                "headOfHousehold": {"standardDeduction": 22500, "brackets": [{"upTo": null, "rate": 0.10}]}
            },
            "fica": {
                "socialSecurityRate": 0.062,
                "socialSecurityWageBase": 176100,
                "medicareRate": 0.0145,
                "additionalMedicareRate": 0.009,
                "additionalMedicareThreshold": {
                    "single": 200000, "marriedJointly": 250000,
                    "marriedSeparate": 125000, "headOfHousehold": 200000
                }
            }
        }"#;
        assert!(validate_tax_snapshot(json).is_err());
    }

    #[test]
    fn tax_rejects_bad_year() {
        let v: serde_json::Value =
            serde_json::from_str(&good_tax_json()).expect("bundled snapshot is JSON");
        let mut map = v.as_object().expect("object").clone();
        map.insert("taxYear".to_string(), serde_json::json!(1999));
        let mutated = serde_json::Value::Object(map).to_string();
        assert!(validate_tax_snapshot(&mutated).is_err());
    }

    #[test]
    fn tax_rejects_non_usd_currency() {
        let v: serde_json::Value =
            serde_json::from_str(&good_tax_json()).expect("bundled snapshot is JSON");
        let mut map = v.as_object().expect("object").clone();
        map.insert("currency".to_string(), serde_json::json!("EUR"));
        let mutated = serde_json::Value::Object(map).to_string();
        assert!(validate_tax_snapshot(&mutated).is_err());
    }

    #[test]
    fn tax_rejects_oversize_payload() {
        let mut s = String::with_capacity(MAX_SNAPSHOT_BYTES + 32);
        s.push('{');
        for _ in 0..(MAX_SNAPSHOT_BYTES + 1) {
            s.push('x');
        }
        assert!(validate_tax_snapshot(&s).is_err());
    }

    // load_dataset (filesystem) ───────────────────────────────────────────

    #[test]
    fn load_dataset_returns_bundled_when_no_overlay() {
        let scratch = scratch_app_data_dir("bundled-fx");
        let resp = load_dataset(FX_DATASET, &scratch, &bundled_resource_dir())
            .expect("bundled fx must load");
        assert_eq!(resp.kind, "fx");
        assert_eq!(resp.source, "bundled");
        assert!(!resp.as_of.is_empty());
    }

    #[test]
    fn load_dataset_tax_returns_bundled_with_ty_label() {
        let scratch = scratch_app_data_dir("bundled-tax");
        let resp = load_dataset(TAX_DATASET, &scratch, &bundled_resource_dir())
            .expect("bundled tax must load");
        assert_eq!(resp.kind, "tax");
        assert_eq!(resp.source, "bundled");
        assert!(resp.as_of.starts_with("TY"));
    }

    #[test]
    fn load_dataset_prefers_overlay_when_present() {
        let scratch = scratch_app_data_dir("overlay-wins");
        let value: serde_json::Value = serde_json::from_str(&good_fx_json()).expect("good fx");
        write_overlay(&scratch, FX_DATASET, &value).expect("overlay write");
        let resp = load_dataset(FX_DATASET, &scratch, &bundled_resource_dir())
            .expect("overlay must load");
        assert_eq!(resp.source, "overlay");
        // Cleanup
        let _ = std::fs::remove_dir_all(&scratch);
    }

    #[test]
    fn load_dataset_rejects_unknown_name() {
        let scratch = scratch_app_data_dir("unknown");
        let resp = load_dataset("evil", &scratch, &bundled_resource_dir());
        assert!(resp.is_err());
    }

    #[test]
    fn corrupted_overlay_is_quarantined_and_falls_back_to_bundled() {
        let scratch = scratch_app_data_dir("corrupt");
        std::fs::create_dir_all(overlay_dir(&scratch)).expect("mkdir");
        std::fs::write(overlay_path(&scratch, FX_DATASET), b"{not valid json")
            .expect("write corrupt");

        let resp = load_dataset(FX_DATASET, &scratch, &bundled_resource_dir())
            .expect("must fall back to bundled");
        assert_eq!(resp.source, "bundled");

        let bad = overlay_path(&scratch, FX_DATASET).with_extension("json.bad");
        assert!(bad.exists(), "corrupted overlay should be quarantined");
        let _ = std::fs::remove_dir_all(&scratch);
    }

    #[test]
    fn delete_overlay_is_idempotent() {
        let scratch = scratch_app_data_dir("delete-idem");
        // Deleting before any write must succeed.
        delete_overlay(&scratch, FX_DATASET).expect("noop delete");

        // Write, delete, delete again — all must succeed.
        let value: serde_json::Value = serde_json::from_str(&good_fx_json()).expect("good fx");
        write_overlay(&scratch, FX_DATASET, &value).expect("write");
        delete_overlay(&scratch, FX_DATASET).expect("first delete");
        delete_overlay(&scratch, FX_DATASET).expect("second delete");
        let _ = std::fs::remove_dir_all(&scratch);
    }
}
