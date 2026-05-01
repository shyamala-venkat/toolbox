/**
 * Number / currency / percent formatting helpers for finance-pack tools.
 *
 * v1 is US-locale only (`en-US`). Locale support is an explicit non-goal —
 * see design doc, Non-Goals section.
 *
 * Non-finite values render as an em-dash so result blocks don't flash "NaN"
 * or "Infinity" while a user is mid-typing. The em-dash matches the empty
 * state defined in the Design Spec interaction matrix.
 */

const LOCALE = 'en-US';
const EM_DASH = '—';

/**
 * Format an amount as a localized currency string. Uses `Intl.NumberFormat`'s
 * default fraction digits for the given currency (USD/EUR -> 2, JPY -> 0).
 *
 * Returns `'—'` for NaN, ±Infinity, or any other non-finite input.
 */
export function formatMoney(amount: number, currency: string = 'USD'): string {
  if (!Number.isFinite(amount)) return EM_DASH;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    // Unknown ISO 4217 code — fall back to the bare number with a code suffix.
    return `${EM_DASH} ${currency}`;
  }
}

/**
 * Format a plain number with the US locale and optional Intl options. NaN /
 * ±Infinity render as `'—'`.
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

/**
 * Format a value as a percent. The input is assumed to be in percent units
 * already (so `7.5` → `"7.50%"`, NOT `0.075`). Pass `0` for whole-number-only
 * percents like `"7%"`.
 *
 * Default fraction digits: 2 — matches the rest of the pack which displays
 * monetary values to two decimals.
 */
export function formatPercent(value: number, fractionDigits: number = 2): string {
  if (!Number.isFinite(value)) return EM_DASH;
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}
