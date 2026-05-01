//! Pure validators shared by the finance import commands.
//!
//! These functions intentionally never echo user-supplied values back in their
//! error messages — every error string is generic and parameterless so that a
//! malformed payload cannot leak its contents through the toast/log surface
//! (Security & Privacy Invariants in the design doc).
//!
//! Date math is implemented with `std::time::SystemTime` and a stdlib
//! Gregorian-calendar conversion. We deliberately avoid pulling in `chrono`
//! or `time` — neither was previously a dependency, and the operations needed
//! here (parse `YYYY-MM-DD`, compute day delta vs today UTC) are small enough
//! to keep dep surface flat.

use std::time::{SystemTime, UNIX_EPOCH};

/// Reject NaN, ±Infinity, zero, and negatives. Used for FX rates, FICA rates
/// (which are bounded separately), and any monetary base.
pub fn validate_finite_positive(n: f64) -> Result<f64, String> {
    if !n.is_finite() {
        return Err("value must be a finite number".to_string());
    }
    if n <= 0.0 {
        return Err("value must be positive".to_string());
    }
    Ok(n)
}

/// 3 ASCII uppercase letters. ISO 4217 currency code shape.
pub fn validate_currency_code(code: &str) -> Result<(), String> {
    if code.len() != 3 || !code.chars().all(|c| c.is_ascii_uppercase()) {
        return Err("invalid currency code".to_string());
    }
    Ok(())
}

/// Tax year must be in `[2020, current_year + 1]`. Anything outside that
/// window is either pre-Cuts-and-Jobs-Act-stable or implausibly future.
pub fn validate_tax_year(year: u32) -> Result<u32, String> {
    let (today_y, _, _) = today_utc_ymd();
    let max_year = today_y.saturating_add(1) as u32;
    if year < 2020 || year > max_year {
        return Err("tax year out of supported range".to_string());
    }
    Ok(year)
}

/// Parse a `YYYY-MM-DD` date and confirm it is in the past or today AND not
/// older than `max_age_days`. Returns the parsed date as `(y, m, d)` tuple.
///
/// Errors are intentionally generic; we never include the offending input.
pub fn validate_iso_date_freshness(
    date_str: &str,
    max_age_days: i64,
) -> Result<(i32, u32, u32), String> {
    let (y, m, d) = parse_iso_date(date_str).map_err(|_| "invalid ISO-8601 date".to_string())?;

    let snapshot_days = days_from_civil(y, m, d);
    let (ty, tm, td) = today_utc_ymd();
    let today_days = days_from_civil(ty, tm, td);

    if snapshot_days > today_days {
        return Err("date must not be in the future".to_string());
    }
    if today_days - snapshot_days > max_age_days {
        return Err("date is too old".to_string());
    }
    Ok((y, m, d))
}

// ── Date helpers ─────────────────────────────────────────────────────────

/// Strict `YYYY-MM-DD` parser. Rejects anything else (including extra
/// time-of-day suffix, alternate separators, or leading zeros missing).
fn parse_iso_date(s: &str) -> Result<(i32, u32, u32), ()> {
    if s.len() != 10 {
        return Err(());
    }
    let bytes = s.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return Err(());
    }
    let y: i32 = s.get(0..4).ok_or(())?.parse().map_err(|_| ())?;
    let m: u32 = s.get(5..7).ok_or(())?.parse().map_err(|_| ())?;
    let d: u32 = s.get(8..10).ok_or(())?.parse().map_err(|_| ())?;
    if !(1..=12).contains(&m) {
        return Err(());
    }
    let dim = days_in_month(y, m);
    if d < 1 || d > dim {
        return Err(());
    }
    Ok((y, m, d))
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(y) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// Howard Hinnant's `days_from_civil`: returns the number of days since the
/// Unix epoch (1970-01-01) for a Gregorian (y, m, d).
/// Public-domain algorithm: <https://howardhinnant.github.io/date_algorithms.html>
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64; // [0, 399]
    let m = m as i64;
    let d = d as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    (era as i64) * 146097 + doe - 719468
}

/// Inverse of `days_from_civil`: given days since epoch, return (y, m, d).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

/// Today's date in UTC. Uses `SystemTime`; if the clock is misconfigured we
/// fall back to the epoch (which causes downstream "too old" rejections —
/// safe-fail).
fn today_utc_ymd() -> (i32, u32, u32) {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    civil_from_days(days)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finite_positive_accepts_valid() {
        assert!(validate_finite_positive(0.001).is_ok());
        assert!(validate_finite_positive(1.0).is_ok());
        assert!(validate_finite_positive(1e9).is_ok());
    }

    #[test]
    fn finite_positive_rejects_nan() {
        assert!(validate_finite_positive(f64::NAN).is_err());
    }

    #[test]
    fn finite_positive_rejects_infinity() {
        assert!(validate_finite_positive(f64::INFINITY).is_err());
        assert!(validate_finite_positive(f64::NEG_INFINITY).is_err());
    }

    #[test]
    fn finite_positive_rejects_zero_and_negative() {
        assert!(validate_finite_positive(0.0).is_err());
        assert!(validate_finite_positive(-0.0).is_err());
        assert!(validate_finite_positive(-1.0).is_err());
    }

    #[test]
    fn currency_code_accepts_three_uppercase() {
        assert!(validate_currency_code("USD").is_ok());
        assert!(validate_currency_code("EUR").is_ok());
        assert!(validate_currency_code("JPY").is_ok());
    }

    #[test]
    fn currency_code_rejects_lowercase() {
        assert!(validate_currency_code("usd").is_err());
        assert!(validate_currency_code("Usd").is_err());
    }

    #[test]
    fn currency_code_rejects_wrong_length() {
        assert!(validate_currency_code("US").is_err());
        assert!(validate_currency_code("USDT").is_err());
        assert!(validate_currency_code("").is_err());
    }

    #[test]
    fn currency_code_rejects_non_letters() {
        assert!(validate_currency_code("U S").is_err());
        assert!(validate_currency_code("US1").is_err());
        assert!(validate_currency_code("US-").is_err());
    }

    #[test]
    fn tax_year_accepts_supported() {
        assert!(validate_tax_year(2025).is_ok());
        assert!(validate_tax_year(2024).is_ok());
        assert!(validate_tax_year(2020).is_ok());
    }

    #[test]
    fn tax_year_rejects_too_old() {
        assert!(validate_tax_year(2019).is_err());
        assert!(validate_tax_year(1999).is_err());
    }

    #[test]
    fn tax_year_rejects_far_future() {
        assert!(validate_tax_year(2200).is_err());
        assert!(validate_tax_year(9999).is_err());
    }

    #[test]
    fn iso_freshness_accepts_today() {
        let (y, m, d) = today_utc_ymd();
        let s = format!("{y:04}-{m:02}-{d:02}");
        assert!(validate_iso_date_freshness(&s, 60).is_ok());
    }

    #[test]
    fn iso_freshness_rejects_future() {
        // One year ahead of "today" is comfortably future under any clock.
        let (y, m, d) = today_utc_ymd();
        let future = format!("{:04}-{:02}-{:02}", y + 1, m, d);
        assert!(validate_iso_date_freshness(&future, 60).is_err());
    }

    #[test]
    fn iso_freshness_rejects_too_old() {
        // Pick a date guaranteed to be older than 60 days regardless of when
        // tests run: 5 years before the epoch's 1970-01-01 anchor is fine
        // because the date arithmetic only cares about delta-from-today.
        assert!(validate_iso_date_freshness("2000-01-01", 60).is_err());
    }

    #[test]
    fn iso_freshness_rejects_malformed() {
        assert!(validate_iso_date_freshness("not-a-date", 60).is_err());
        assert!(validate_iso_date_freshness("2025/04/15", 60).is_err());
        assert!(validate_iso_date_freshness("2025-4-15", 60).is_err());
        assert!(validate_iso_date_freshness("2025-13-01", 60).is_err());
        assert!(validate_iso_date_freshness("2025-02-30", 60).is_err());
        assert!(validate_iso_date_freshness("", 60).is_err());
        assert!(validate_iso_date_freshness("2025-04-15T00:00:00Z", 60).is_err());
    }

    #[test]
    fn date_round_trip() {
        // Sanity check that civil ↔ days inversion holds for a span of dates.
        for &(y, m, d) in &[
            (1970, 1, 1),
            (2000, 2, 29),
            (2024, 2, 29),
            (2025, 4, 15),
            (2099, 12, 31),
        ] {
            let z = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(z), (y, m, d));
        }
    }
}
