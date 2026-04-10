/**
 * Formatting helpers for the Timestamp Converter.
 *
 * Pure functions; no React, no DOM. Tests can call these directly.
 */

export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'local', label: 'Local (system)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];

export const isValidTimezone = (zone: string): boolean => {
  if (zone === 'local') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const getSystemTimezoneName = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export const formatUnixSeconds = (date: Date): string =>
  Math.floor(date.getTime() / 1000).toString();

export const formatUnixMilliseconds = (date: Date): string => date.getTime().toString();

export const formatISO8601 = (date: Date): string => date.toISOString();

export const formatUtcReadable = (date: Date): string => date.toUTCString();

export const formatInTimezone = (date: Date, timezone: string): string => {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  };
  if (timezone !== 'local') {
    opts.timeZone = timezone;
  }
  try {
    return new Intl.DateTimeFormat(undefined, opts).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: undefined }).format(date);
  }
};

// ─── Relative time ──────────────────────────────────────────────────────────

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

export const formatRelative = (date: Date, now: Date = new Date()): string => {
  const deltaSeconds = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(deltaSeconds);
  if (abs < 1) return 'just now';

  for (const [unit, secondsPerUnit] of RELATIVE_UNITS) {
    if (abs >= secondsPerUnit || unit === 'second') {
      const value = Math.round(deltaSeconds / secondsPerUnit);
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return rtf.format(value, unit);
    }
  }
  return 'just now';
};
