/**
 * Pure-function input validation for finance-pack tools.
 *
 * All numeric inputs across the finance pack flow through `parseAndValidate`.
 * Discriminated-union return shape keeps the call sites tidy:
 *
 *   const r = parseAndValidate(value, { min: 0, fieldLabel: 'Bill' });
 *   if (!r.ok) showError(r.error);
 *   else use(r.value);
 *
 * Error messages are intentionally generic — they MUST NOT echo the user's
 * raw input back to a toast or any visible surface. That avoids leaking
 * financial values into UI logs or AT announcements (per Security & Privacy
 * invariants in the design spec).
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface ValidateNumberOpts {
  /** Inclusive lower bound. */
  min?: number;
  /** Inclusive upper bound. */
  max?: number;
  /** Reject any non-integer value (uses `Number.isInteger`). */
  integer?: boolean;
  /**
   * When true, an empty input returns `{ ok: true, value: NaN }` and the
   * caller is responsible for treating NaN as "not entered". When false (the
   * default), an empty input fails with a "<label> is required" error.
   */
  optional?: boolean;
  /** Optional label used in error messages. Falls back to the generic word. */
  fieldLabel?: string;
}

const US_THOUSANDS_RE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
const PLAIN_NUMBER_RE = /^-?\d+(\.\d+)?$/;
const SCIENTIFIC_RE = /^-?\d+(\.\d+)?[eE][+-]?\d+$/;

/**
 * Parse `raw` into a finite number with bounds and integer checks. Returns a
 * discriminated union; never throws.
 *
 * Accepted shapes (after trimming):
 *   - Plain decimals: "0", "1.5", "-2.0"
 *   - US thousands separators: "1,000", "1,234,567.89"
 *   - One trailing percent sign: "7%", "12.5%"
 *   - Scientific notation: "1e3"
 *
 * Rejected shapes:
 *   - Empty (when `optional` is false)
 *   - Anything containing letters other than `e`/`E` for scientific
 *   - Non-US thousands grouping (e.g. "1,00,0.50")
 *   - NaN / Infinity / -Infinity
 *   - Out-of-range vs. min / max
 *   - Non-integer when `integer: true`
 */
export function parseAndValidate(
  raw: string,
  opts: ValidateNumberOpts = {},
): ValidationResult<number> {
  const label = opts.fieldLabel?.trim() ?? '';
  const labelPrefix = label.length > 0 ? label : 'Value';
  const requiredMsg = label.length > 0 ? `${label} is required` : 'Required';

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    if (opts.optional) return { ok: true, value: Number.NaN };
    return { ok: false, error: requiredMsg };
  }

  // Strip a single trailing percent sign so callers can accept "7%".
  let working = trimmed;
  if (working.endsWith('%')) working = working.slice(0, -1).trimEnd();
  if (working.length === 0) {
    return { ok: false, error: `${labelPrefix} must be a number` };
  }

  // If commas are present, ONLY accept the strict US thousands format.
  // Without this, "1,2,3" or "1,00,0.50" would silently parse as 1234 etc.
  if (working.includes(',')) {
    if (!US_THOUSANDS_RE.test(working)) {
      return { ok: false, error: `${labelPrefix} must be a number` };
    }
    working = working.replace(/,/g, '');
  } else if (
    !PLAIN_NUMBER_RE.test(working) &&
    !SCIENTIFIC_RE.test(working)
  ) {
    return { ok: false, error: `${labelPrefix} must be a number` };
  }

  const value = Number(working);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${labelPrefix} must be a number` };
  }

  if (opts.integer && !Number.isInteger(value)) {
    return { ok: false, error: `${labelPrefix} must be a whole number` };
  }

  if (typeof opts.min === 'number' && value < opts.min) {
    return {
      ok: false,
      error: `${labelPrefix} must be at least ${opts.min}`,
    };
  }
  if (typeof opts.max === 'number' && value > opts.max) {
    return {
      ok: false,
      error: `${labelPrefix} must be at most ${opts.max}`,
    };
  }

  return { ok: true, value };
}
