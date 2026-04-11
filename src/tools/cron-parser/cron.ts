/**
 * Hand-rolled cron next-run-time calculator.
 *
 * Supports standard 5-field cron (minute hour day-of-month month day-of-week)
 * and 6-field with leading seconds. Day-of-week: 0=Sunday, 7=Sunday.
 * Supports ranges (1-5), lists (1,3,5), steps (asterisk/5), and wildcards (*).
 */

// ─── Field parsing ─────────────────────────────────────────────────────────

interface FieldRange {
  min: number;
  max: number;
}

const FIELD_RANGES: Record<string, FieldRange> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 },
};

const DAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function replaceNames(field: string, fieldName: string): string {
  let result = field.toUpperCase();
  if (fieldName === 'dayOfWeek') {
    for (const [name, value] of Object.entries(DAY_NAMES)) {
      result = result.replace(new RegExp(name, 'g'), String(value));
    }
  }
  if (fieldName === 'month') {
    for (const [name, value] of Object.entries(MONTH_NAMES)) {
      result = result.replace(new RegExp(name, 'g'), String(value));
    }
  }
  return result;
}

function parseField(field: string, fieldName: string): Set<number> {
  const range = FIELD_RANGES[fieldName];
  if (!range) throw new Error(`Unknown field: ${fieldName}`);

  const resolved = replaceNames(field, fieldName);
  const values = new Set<number>();

  for (const part of resolved.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle step: */N or N-M/N
    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    const stepStr = stepMatch ? stepMatch[2] : null;
    const base = stepMatch && stepMatch[1] ? stepMatch[1] : trimmed;
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (step <= 0) throw new Error(`Invalid step: ${step}`);

    if (base === '*') {
      for (let i = range.min; i <= range.max; i += step) {
        values.add(i);
      }
    } else if (base.includes('-')) {
      const [startStr, endStr] = base.split('-');
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: ${base}`);
      for (let i = start; i <= end; i += step) {
        values.add(fieldName === 'dayOfWeek' && i === 7 ? 0 : i);
      }
    } else {
      const val = parseInt(base, 10);
      if (isNaN(val)) throw new Error(`Invalid value: ${base}`);
      values.add(fieldName === 'dayOfWeek' && val === 7 ? 0 : val);
    }
  }

  return values;
}

// ─── Parsed cron ───────────────────────────────────────────────────────────

export interface ParsedCron {
  seconds: Set<number>;
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  hasSeconds: boolean;
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) {
    throw new Error(
      `Expected 5 or 6 fields, got ${fields.length}. ` +
      'Format: [second] minute hour day-of-month month day-of-week',
    );
  }

  const hasSeconds = fields.length === 6;
  const offset = hasSeconds ? 1 : 0;

  return {
    seconds: hasSeconds ? parseField(fields[0]!, 'second') : new Set([0]),
    minutes: parseField(fields[offset]!, 'minute'),
    hours: parseField(fields[offset + 1]!, 'hour'),
    daysOfMonth: parseField(fields[offset + 2]!, 'dayOfMonth'),
    months: parseField(fields[offset + 3]!, 'month'),
    daysOfWeek: parseField(fields[offset + 4]!, 'dayOfWeek'),
    hasSeconds,
  };
}

// ─── Next run times ────────────────────────────────────────────────────────

/**
 * Compute the next N execution times from a given start date.
 * Caps at maxIterations to prevent infinite loops on impossible expressions.
 */
export function getNextRunTimes(
  parsed: ParsedCron,
  count: number,
  from: Date = new Date(),
  maxIterations = 10_000,
): Date[] {
  const results: Date[] = [];
  const cursor = new Date(from);

  // Advance by 1 second (or 1 minute if no seconds field) from the start
  if (parsed.hasSeconds) {
    cursor.setSeconds(cursor.getSeconds() + 1, 0);
  } else {
    cursor.setMinutes(cursor.getMinutes() + 1);
    cursor.setSeconds(0, 0);
  }

  let iterations = 0;

  while (results.length < count && iterations < maxIterations) {
    iterations++;

    // Check month
    if (!parsed.months.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    // Check day of month
    if (!parsed.daysOfMonth.has(cursor.getDate())) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    // Check day of week
    if (!parsed.daysOfWeek.has(cursor.getDay())) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    // Check hour
    if (!parsed.hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }

    // Check minute
    if (!parsed.minutes.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }

    // Check second
    if (!parsed.seconds.has(cursor.getSeconds())) {
      cursor.setSeconds(cursor.getSeconds() + 1, 0);
      continue;
    }

    // All fields match
    results.push(new Date(cursor));

    // Advance to next candidate
    if (parsed.hasSeconds) {
      cursor.setSeconds(cursor.getSeconds() + 1, 0);
    } else {
      cursor.setMinutes(cursor.getMinutes() + 1);
      cursor.setSeconds(0, 0);
    }
  }

  return results;
}

// ─── Presets ───────────────────────────────────────────────────────────────

export interface CronPreset {
  label: string;
  expression: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Weekdays at 9am', expression: '0 9 * * 1-5' },
  { label: 'Monthly on the 1st', expression: '0 0 1 * *' },
  { label: 'Every Sunday at noon', expression: '0 12 * * 0' },
  { label: 'Every 30 seconds', expression: '*/30 * * * * *' },
];
