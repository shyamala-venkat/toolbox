/**
 * Toast-safe error helper.
 *
 * Errors produced anywhere in the finance pack — including string-typed
 * rejections from Rust IPC — must NOT echo user financial values into the
 * toast / log / live-region surfaces. This helper inspects the message and
 * returns either:
 *
 *   - the original message if it looks structural / safe, or
 *   - a generic fallback if it might leak digits.
 *
 * The rule of thumb: a long-digit run, OR a currency symbol followed by
 * digits, is treated as user-data leakage and replaced.
 */

const LONG_DIGIT_RUN = /\d{4,}/;
// Common currency symbols followed by any digit. Conservative — anything
// shaped like "$5", "€5,000", "£12.34" trips the redactor.
const CURRENCY_THEN_DIGIT = /[$€£¥₹]\s?\d/;

const DEFAULT_FALLBACK = 'Could not complete this action';

/**
 * Returns either `message` (when it looks safe) or `fallback` (when it
 * appears to contain user-supplied numbers). Always returns a non-empty
 * string — if both `message` and `fallback` are empty, the package default
 * is used.
 */
export function redactedError(
  message: string,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const safeFallback =
    fallback.trim().length > 0 ? fallback : DEFAULT_FALLBACK;

  if (typeof message !== 'string' || message.trim().length === 0) {
    return safeFallback;
  }

  if (LONG_DIGIT_RUN.test(message)) return safeFallback;
  if (CURRENCY_THEN_DIGIT.test(message)) return safeFallback;

  return message;
}
