/**
 * Defensive sanitizer for the persisted `history` slice.
 *
 * The Rust preferences file is a free-form JSON blob — a corrupted edit, a
 * stale schema from a future version, or a downgrade can deliver anything
 * here. Validate every field against its runtime shape and silently fall
 * back to the hard-coded defaults when something is off. Mirrors the
 * `sanitize*Defaults` pattern used by individual tools.
 *
 * Out-of-scope today (always-pause map is read-through only in PR-A;
 * mutation lands in PR-B with the per-tool kebab menu).
 */

import type { HistoryRetention } from '@/lib/tauri';

export interface HistoryDefaults {
  /** Global drawer expand state. Read-only in PR-A; mutated in PR-B. */
  drawerExpanded: boolean;
  /** Global pause flag. Mirrors the Rust-side store flag. */
  paused: boolean;
  /** Retention TTL: 1d | 7d | 30d | forever. */
  retention: HistoryRetention;
  /** Whether the user has dismissed the first sensitive-block toast. */
  firstBlockToastDismissed: boolean;
  /** Per-tool always-pause flags. Empty in PR-A; populated by PR-B. */
  perToolPaused: Record<string, boolean>;
}

export const DEFAULT_HISTORY_DEFAULTS: HistoryDefaults = {
  drawerExpanded: false,
  paused: false,
  retention: '7d',
  firstBlockToastDismissed: false,
  perToolPaused: {},
};

const RETENTIONS: ReadonlySet<HistoryRetention> = new Set<HistoryRetention>([
  '1d',
  '7d',
  '30d',
  'forever',
]);

const isRetention = (value: unknown): value is HistoryRetention =>
  typeof value === 'string' && RETENTIONS.has(value as HistoryRetention);

const sanitizePerToolPaused = (raw: unknown): Record<string, boolean> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Reject anything that isn't an exact boolean. A string "true" or a 1
    // could be a downgrade artifact — silently drop it.
    if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
};

export function sanitizeHistoryDefaults(raw: unknown): HistoryDefaults {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_HISTORY_DEFAULTS, perToolPaused: {} };
  }
  const obj = raw as Record<string, unknown>;
  return {
    drawerExpanded:
      typeof obj.drawerExpanded === 'boolean'
        ? obj.drawerExpanded
        : DEFAULT_HISTORY_DEFAULTS.drawerExpanded,
    paused:
      typeof obj.paused === 'boolean'
        ? obj.paused
        : DEFAULT_HISTORY_DEFAULTS.paused,
    retention: isRetention(obj.retention)
      ? obj.retention
      : DEFAULT_HISTORY_DEFAULTS.retention,
    firstBlockToastDismissed:
      typeof obj.firstBlockToastDismissed === 'boolean'
        ? obj.firstBlockToastDismissed
        : DEFAULT_HISTORY_DEFAULTS.firstBlockToastDismissed,
    perToolPaused: sanitizePerToolPaused(obj.perToolPaused),
  };
}
