/**
 * Bucket history rows into the chronological groups the drawer renders:
 *
 *   Pinned · Today · Yesterday · Earlier this week · Earlier this month · Older
 *
 * Pinned entries are surfaced regardless of age. Within each group the rows
 * are kept in their original order (the IPC already returns them in
 * timestamp-desc order).
 *
 * All comparisons happen in the user's local time. We never accept a
 * fabricated timestamp from the backend — Rust generates them with
 * `chrono::Utc::now()` — so timezone drift is bounded by clock skew on
 * the same machine.
 */

import type { HistoryEntry } from '@/lib/tauri';

export type HistoryGroupKey =
  | 'pinned'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'older';

export interface HistoryGroup {
  key: HistoryGroupKey;
  label: string;
  rows: HistoryEntry[];
}

const GROUP_LABELS: Record<HistoryGroupKey, string> = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'Earlier this week',
  thisMonth: 'Earlier this month',
  older: 'Older',
};

const GROUP_ORDER: ReadonlyArray<HistoryGroupKey> = [
  'pinned',
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'older',
];

const startOfDay = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const dayDiff = (a: Date, b: Date): number => {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const bucketFor = (entryDate: Date, now: Date): HistoryGroupKey => {
  const days = dayDiff(now, entryDate);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'thisWeek';
  if (days < 31) return 'thisMonth';
  return 'older';
};

export function groupHistoryRows(
  rows: ReadonlyArray<HistoryEntry>,
  now: Date = new Date(),
): HistoryGroup[] {
  const buckets: Record<HistoryGroupKey, HistoryEntry[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const row of rows) {
    if (row.pinned) {
      buckets.pinned.push(row);
      continue;
    }
    const ts = new Date(row.timestamp);
    if (Number.isNaN(ts.getTime())) {
      buckets.older.push(row);
      continue;
    }
    buckets[bucketFor(ts, now)].push(row);
  }

  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    rows: buckets[key],
  }));
}
