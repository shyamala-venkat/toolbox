//! Sensitive-content detection for the tool-history feature.
//!
//! Two responsibilities:
//!
//!   1. `is_blocklisted_tool(tool_id)` — defense-in-depth list of tool ids whose
//!      runs must NEVER persist content (only metadata-only tombstone rows).
//!      The frontend ALSO filters these (`sensitiveContent: true` in `meta.ts`),
//!      but the Rust side independently rejects writes; a CI parity check keeps
//!      the two in sync.
//!
//!   2. `contains_secret(text)` — single-pass `RegexSet` scan over a curated
//!      subset of patterns from `gitleaks/config/gitleaks.toml`
//!      (https://github.com/gitleaks/gitleaks, MIT). The patterns target the
//!      most common "high-confidence" secret families: AWS access keys, GitHub
//!      tokens, Stripe keys, Slack tokens, Google API keys, generic Bearer
//!      headers, generic `sk-` provider keys, PEM private-key blocks, and
//!      JWT-shaped strings.
//!
//! Quarterly review against upstream gitleaks is documented in CLAUDE.md
//! (Gitleaks pattern refresh cadence). Pattern sources are public-domain
//! shapes; this list is intentionally small to keep the scan O(n) and the
//! false-positive rate auditable.

use once_cell::sync::Lazy;
use regex::RegexSet;

/// Tool ids whose inputs and outputs must never be persisted as content.
///
/// Order doesn't matter; a `ToolPage` filter and the IPC handler both
/// short-circuit on a hit. Keep this list IDENTICAL to the union of tools
/// with `sensitiveContent: true` in `src/tools/*/meta.ts`. A CI assertion
/// (see `tasks/tool-history.md` §"CI / parity check") fails the build on
/// drift.
pub const SENSITIVE_TOOLS: &[&str] = &[
    "password-gen",
    "password-checker",
    "hash-generator",
    "jwt-decoder",
    "backslash-escape",
    "paycheck-calc",
    "tax-bracket-estimator",
];

/// Stable identifier for each pattern. Returned by `contains_secret` so the
/// caller can record `reason="sensitive_pattern:<id>"` in tombstone rows.
/// Order MUST match `RAW_PATTERNS` below.
const PATTERN_IDS: &[&str] = &[
    "aws_access_key",
    "github_pat",
    "github_fine_grained_pat",
    "stripe_live_key",
    "stripe_restricted_key",
    "slack_token",
    "google_api_key",
    "bearer_token",
    "generic_sk_key",
    "pem_private_key",
    "jwt",
];

/// Curated subset of gitleaks v8 patterns. Each entry is
/// `(id, regex)`; `id` is also stored at the same index in `PATTERN_IDS` so
/// `RegexSet::matches` can map an index back to a stable name.
const RAW_PATTERNS: &[&str] = &[
    // AWS access key (4 prefix variants collapsed; the AKIA family is what
    // gitleaks flags as high-confidence; ASIA/AGPA/etc. omitted to keep the
    // false-positive surface small).
    r"AKIA[0-9A-Z]{16}",
    // GitHub classic personal access token.
    r"ghp_[A-Za-z0-9]{36,}",
    // GitHub fine-grained personal access token.
    r"github_pat_[A-Za-z0-9_]{82,}",
    // Stripe live secret key.
    r"sk_live_[A-Za-z0-9]{24,}",
    // Stripe restricted live key.
    r"rk_live_[A-Za-z0-9]{24,}",
    // Slack token (bot/app/refresh/user/scope).
    r"xox[baprs]-[A-Za-z0-9-]{10,}",
    // Google API key.
    r"AIza[0-9A-Za-z_-]{35}",
    // Generic `Authorization: Bearer …` header value. Case-insensitive on
    // the literal prefix; the token charset matches RFC 6750.
    r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{20,}",
    // Generic `sk-` prefixed key (OpenAI, Anthropic, etc.).
    r"sk-[A-Za-z0-9]{32,}",
    // PEM private key block (openssh / rsa / ec / dsa or generic).
    r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
    // JWT (header.payload.signature, base64url segments). Conservative: each
    // segment must be ≥ 8 chars to avoid matching arbitrary three-segment
    // dotted strings.
    r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}",
];

/// Lazily compiled, reused for the lifetime of the process. `expect` is
/// acceptable here because the patterns are constant; a panic at startup
/// is preferable to a silent fall-through that lets secrets leak into the
/// history DB.
static SECRET_REGEX_SET: Lazy<RegexSet> = Lazy::new(|| {
    RegexSet::new(RAW_PATTERNS).expect("RegexSet built from known-good gitleaks patterns")
});

/// Return true iff `tool_id` is on the hard-coded blocklist of
/// sensitive-content tools (passwords, hashes, JWT decode, paycheck, etc.).
pub fn is_blocklisted_tool(tool_id: &str) -> bool {
    SENSITIVE_TOOLS.contains(&tool_id)
}

/// Run the secret regex set against `text`. On match, returns the stable id
/// of the FIRST matching pattern (in the order declared above). On no match,
/// returns `None`.
///
/// The scan is a single pass over `text` regardless of how many patterns are
/// active, so cost is O(n) in input size. Empty input is short-circuited.
pub fn contains_secret(text: &str) -> Option<&'static str> {
    if text.is_empty() {
        return None;
    }
    let matches = SECRET_REGEX_SET.matches(text);
    if !matches.matched_any() {
        return None;
    }
    // Deterministic: pick the lowest-indexed match.
    matches
        .iter()
        .next()
        .and_then(|i| PATTERN_IDS.get(i).copied())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pattern_id_arrays_match_length() {
        // The two parallel arrays must stay in lockstep, otherwise
        // `contains_secret` could map an index to the wrong id.
        assert_eq!(PATTERN_IDS.len(), RAW_PATTERNS.len());
    }

    #[test]
    fn blocklist_contains_expected_tools() {
        assert!(is_blocklisted_tool("password-gen"));
        assert!(is_blocklisted_tool("password-checker"));
        assert!(is_blocklisted_tool("hash-generator"));
        assert!(is_blocklisted_tool("jwt-decoder"));
        assert!(is_blocklisted_tool("backslash-escape"));
        assert!(is_blocklisted_tool("paycheck-calc"));
        assert!(is_blocklisted_tool("tax-bracket-estimator"));
    }

    #[test]
    fn blocklist_rejects_safe_tools() {
        assert!(!is_blocklisted_tool("json-formatter"));
        assert!(!is_blocklisted_tool("base64"));
        assert!(!is_blocklisted_tool(""));
        assert!(!is_blocklisted_tool("nonexistent-tool"));
    }

    #[test]
    fn contains_secret_empty_returns_none() {
        assert!(contains_secret("").is_none());
    }

    #[test]
    fn contains_secret_no_match_returns_none() {
        assert!(contains_secret("hello world, no secrets here").is_none());
        assert!(contains_secret("{\"name\": \"alice\", \"age\": 30}").is_none());
    }

    #[test]
    fn detects_aws_access_key() {
        let text = "AWS_KEY=AKIAIOSFODNN7EXAMPLE rest";
        assert_eq!(contains_secret(text), Some("aws_access_key"));
    }

    #[test]
    fn detects_github_pat() {
        // 40-char body — gitleaks high-confidence PAT shape.
        let text = "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789";
        assert_eq!(contains_secret(text), Some("github_pat"));
    }

    #[test]
    fn detects_github_fine_grained_pat() {
        // Fine-grained PATs are 82+ char body after the prefix.
        let body = "a".repeat(82);
        let text = format!("auth: github_pat_{body}");
        assert_eq!(contains_secret(&text), Some("github_fine_grained_pat"));
    }

    #[test]
    fn detects_stripe_live_key() {
        let text = "STRIPE=sk_live_000000000000000000000000 end";
        assert_eq!(contains_secret(text), Some("stripe_live_key"));
    }

    #[test]
    fn detects_stripe_restricted_key() {
        let text = "key=rk_live_000000000000000000000000 end";
        assert_eq!(contains_secret(text), Some("stripe_restricted_key"));
    }

    #[test]
    fn detects_slack_token() {
        let text = "slack=xoxb-1234567890-deadbeef";
        assert_eq!(contains_secret(text), Some("slack_token"));
    }

    #[test]
    fn detects_google_api_key() {
        // 35 chars after AIza, mixed alphanumerics.
        let text = "key=AIzaSyA-deadbeefdeadbeefdeadbeefdeadbeef0";
        assert_eq!(contains_secret(text), Some("google_api_key"));
    }

    #[test]
    fn detects_bearer_token() {
        let text = "Authorization: Bearer abcdef0123456789ABCDEF==";
        assert_eq!(contains_secret(text), Some("bearer_token"));
    }

    #[test]
    fn detects_generic_sk_key() {
        let text = "openai_key=sk-abcdefghijklmnopqrstuvwxyz0123456789";
        assert_eq!(contains_secret(text), Some("generic_sk_key"));
    }

    #[test]
    fn detects_pem_private_key() {
        let text = "preamble\n-----BEGIN RSA PRIVATE KEY-----\nMIIE... ";
        assert_eq!(contains_secret(text), Some("pem_private_key"));
    }

    #[test]
    fn detects_pem_private_key_generic() {
        let text = "-----BEGIN PRIVATE KEY-----\nMIIE";
        assert_eq!(contains_secret(text), Some("pem_private_key"));
    }

    #[test]
    fn detects_jwt() {
        // header.payload.sig, all base64url, each segment ≥ 8 chars.
        let text =
            "token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJ";
        assert_eq!(contains_secret(text), Some("jwt"));
    }

    /// Critical false-positive guard: a JSON document or doc string that
    /// MENTIONS the existence of secrets but contains no real ones must NOT
    /// match. This is the most common false positive class — UI copy and
    /// docs often discuss credentials in plain English.
    #[test]
    fn does_not_match_documentation_about_secrets() {
        let benign = r#"{
            "description": "AWS access keys are stored in env vars.",
            "tip": "Never commit your GitHub PAT or Stripe key to git.",
            "example": "Set Authorization: Bearer <your token here>",
            "note": "PEM private keys belong in your password manager."
        }"#;
        assert_eq!(contains_secret(benign), None);
    }

    /// Bearer with a too-short token should NOT match — the {20,} bound is
    /// load-bearing. (E.g., "Bearer x" must not produce a tombstone.)
    #[test]
    fn bearer_short_token_is_not_a_match() {
        assert!(contains_secret("Authorization: Bearer short").is_none());
    }
}
