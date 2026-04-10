/**
 * Parse a free-form timestamp string into a `Date`, returning a description of
 * how the value was interpreted so the UI can show the user what we did.
 *
 * Detection precedence:
 *   1. Pure-digit strings → Unix seconds (10 chars or fewer) or
 *      Unix milliseconds (13+ chars). 11–12 digit values fall back to seconds.
 *   2. ISO 8601 strings (`Date.parse` accepts these reliably).
 *   3. Anything else `Date` can parse natively.
 */

export type DetectedKind = 'unix-seconds' | 'unix-milliseconds' | 'iso-8601' | 'natural';

export interface ParseSuccess {
  ok: true;
  date: Date;
  kind: DetectedKind;
}

export interface ParseFailure {
  ok: false;
  reason: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const isFiniteDate = (d: Date): boolean => Number.isFinite(d.getTime());

export const parseTimestamp = (raw: string): ParseResult => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // ─── Numeric paths ────────────────────────────────────────────────────────
  // Allow an optional leading minus for pre-1970 timestamps.
  if (/^-?\d+$/.test(trimmed)) {
    const digits = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
    // Use Number for safety; we cap usable epoch values well below
    // Number.MAX_SAFE_INTEGER so this is fine.
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, reason: 'Number out of range' };
    }
    // 13+ digits → milliseconds. 10 digits → seconds. 11–12 → ambiguous,
    // prefer seconds because that's the typical Unix-epoch range
    // (sec ~3.1k years vs ms ~317 years from epoch, the longer span wins).
    let date: Date;
    let kind: DetectedKind;
    if (digits.length >= 13) {
      date = new Date(n);
      kind = 'unix-milliseconds';
    } else {
      date = new Date(n * 1000);
      kind = 'unix-seconds';
    }
    if (!isFiniteDate(date)) {
      return { ok: false, reason: 'Timestamp out of range' };
    }
    return { ok: true, date, kind };
  }

  // ─── ISO 8601 ─────────────────────────────────────────────────────────────
  if (ISO_8601_RE.test(trimmed)) {
    const date = new Date(trimmed);
    if (isFiniteDate(date)) {
      return { ok: true, date, kind: 'iso-8601' };
    }
  }

  // ─── Natural language fallback ────────────────────────────────────────────
  const fallback = new Date(trimmed);
  if (isFiniteDate(fallback)) {
    return { ok: true, date: fallback, kind: 'natural' };
  }

  return { ok: false, reason: 'Could not parse as a date or timestamp' };
};

export const describeKind = (kind: DetectedKind): string => {
  switch (kind) {
    case 'unix-seconds':
      return 'Unix seconds';
    case 'unix-milliseconds':
      return 'Unix milliseconds';
    case 'iso-8601':
      return 'ISO 8601';
    case 'natural':
      return 'Natural language date';
  }
};
