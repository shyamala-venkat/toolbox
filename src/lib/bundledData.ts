/**
 * Frontend wrapper around `getFinanceDataset` that derives the staleness
 * banner state used by the Currency Converter and (with `'static'` tone)
 * the Tax/Paycheck disclaimers.
 *
 * The Rust side returns `{ kind, data, source, asOf }`. This module pulls in
 * the freshness math so each consumer doesn't re-implement it.
 *
 * Tone tiers (from design doc):
 *   - fresh:  ≤ 7 days old
 *   - amber:  > 7 d, ≤ 30 d
 *   - red:    > 30 d
 *   - static: tax data — no freshness color, just a tax-year label
 */

import {
  getFinanceDataset,
  type FinanceDatasetName,
  type FinanceDatasetResponse,
} from './tauri';

export type FreshnessTone = 'fresh' | 'amber' | 'red';

export interface BundledDataState<T = unknown> {
  data: T;
  /** ISO date for fx-usd; "TY{year}" or similar for tax-fed. */
  asOf: string;
  source: 'overlay' | 'bundled';
  /** -1 when `asOf` is not parseable as a date (e.g. "TY2025"). */
  ageDays: number;
  tone: FreshnessTone | 'static';
}

const ONE_DAY_MS = 86_400_000;

/**
 * Pure freshness classifier — exported so it can be unit-tested in isolation.
 *
 * Returns `'static'` whenever `asOf` cannot be parsed as a calendar date.
 * That intentionally matches the tax dataset, where `asOf` is something like
 * `"TY2025"` and we don't want a color-coded staleness UI.
 */
export function computeTone(
  asOf: string,
  now: Date = new Date(),
): { tone: FreshnessTone | 'static'; ageDays: number } {
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) return { tone: 'static', ageDays: -1 };

  const diffMs = now.getTime() - parsed;
  const ageDays = Math.max(0, Math.floor(diffMs / ONE_DAY_MS));

  if (ageDays <= 7) return { tone: 'fresh', ageDays };
  if (ageDays <= 30) return { tone: 'amber', ageDays };
  return { tone: 'red', ageDays };
}

/**
 * Load a finance dataset via Tauri IPC and decorate it with the derived
 * freshness fields. Re-throws the underlying string error from Rust unchanged
 * — callers that surface it to a toast should pass it through `redactedError`.
 */
export async function loadFinanceDataset<T = unknown>(
  name: FinanceDatasetName,
  now?: Date,
): Promise<BundledDataState<T>> {
  const response: FinanceDatasetResponse = await getFinanceDataset(name);
  const { tone, ageDays } = computeTone(response.asOf, now);

  return {
    data: response.data as T,
    asOf: response.asOf,
    source: response.source,
    ageDays,
    tone,
  };
}
