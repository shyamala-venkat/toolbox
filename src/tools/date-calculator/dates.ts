/**
 * Pure date calculation functions. No libraries — just the Date API.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const getDayName = (date: Date): string => DAY_NAMES[date.getDay()] ?? 'Unknown';

/**
 * ISO 8601 week number.
 */
export const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/**
 * Format a date as YYYY-MM-DD for <input type="date"> value.
 */
export const toDateInputValue = (date: Date): string => {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parse a YYYY-MM-DD string into a local Date.
 */
export const parseDateInput = (value: string): Date | null => {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const yStr = parts[0];
  const mStr = parts[1];
  const dStr = parts[2];
  if (!yStr || !mStr || !dStr) return null;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = parseInt(dStr, 10);
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
};

// ─── Difference ─────────────────────────────────────────────────────────────

export interface DateDifference {
  totalDays: number;
  businessDays: number;
  years: number;
  months: number;
  days: number;
  weeks: number;
}

/**
 * Count business days (Mon-Fri) between two dates, exclusive of start, inclusive of end.
 */
const countBusinessDays = (start: Date, end: Date): number => {
  let count = 0;
  const current = new Date(start);
  const direction = end >= start ? 1 : -1;
  const endTime = end.getTime();

  current.setDate(current.getDate() + direction);
  while (
    direction > 0 ? current.getTime() <= endTime : current.getTime() >= endTime
  ) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + direction);
  }
  return count;
};

/**
 * Compute a human-friendly year/month/day breakdown between two dates.
 */
const computeBreakdown = (
  start: Date,
  end: Date,
): { years: number; months: number; days: number } => {
  let a = start;
  let b = end;
  if (a > b) {
    [a, b] = [b, a];
  }

  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();

  if (days < 0) {
    months--;
    // Days in previous month of b
    const prevMonth = new Date(b.getFullYear(), b.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
};

export const computeDifference = (date1: Date, date2: Date): DateDifference => {
  const totalMs = Math.abs(date2.getTime() - date1.getTime());
  const totalDays = Math.round(totalMs / 86400000);
  const businessDays = countBusinessDays(
    date1 <= date2 ? date1 : date2,
    date1 <= date2 ? date2 : date1,
  );
  const { years, months, days } = computeBreakdown(date1, date2);
  const weeks = Math.floor(totalDays / 7);

  return { totalDays, businessDays, years, months, days, weeks };
};

// ─── Add / Subtract ─────────────────────────────────────────────────────────

export type DurationUnit = 'days' | 'weeks' | 'months' | 'years';

/**
 * Add or subtract a duration from a date.
 * Business-days mode only applies when unit is 'days'.
 */
export const addDuration = (
  date: Date,
  amount: number,
  unit: DurationUnit,
  direction: 'add' | 'subtract',
  businessDaysOnly: boolean,
): Date => {
  const sign = direction === 'add' ? 1 : -1;
  const result = new Date(date);

  if (unit === 'days' && businessDaysOnly) {
    let remaining = Math.abs(amount);
    const step = sign;
    while (remaining > 0) {
      result.setDate(result.getDate() + step);
      const day = result.getDay();
      if (day !== 0 && day !== 6) remaining--;
    }
    return result;
  }

  switch (unit) {
    case 'days':
      result.setDate(result.getDate() + amount * sign);
      break;
    case 'weeks':
      result.setDate(result.getDate() + amount * 7 * sign);
      break;
    case 'months':
      result.setMonth(result.getMonth() + amount * sign);
      break;
    case 'years':
      result.setFullYear(result.getFullYear() + amount * sign);
      break;
  }

  return result;
};

/**
 * Format a date in a human-friendly way.
 */
export const formatDateLong = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
