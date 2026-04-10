/**
 * Frontend utility functions.
 */

/**
 * Merge class names. Accepts strings, falsy values, and arrays; drops
 * anything else. Intentionally tiny — we don't pull in `clsx` because we
 * don't need its feature surface and it's trivial to implement.
 */
export type ClassValue = string | number | false | null | undefined | ClassValue[];

export const cn = (...values: ClassValue[]): string => {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v && v !== 0) return;
    if (typeof v === 'string') {
      if (v) out.push(v);
      return;
    }
    if (typeof v === 'number') {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
    }
  };
  for (const v of values) walk(v);
  return out.join(' ');
};

/**
 * Format a byte count as a human-readable string (e.g. "1.5 MB").
 */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};
