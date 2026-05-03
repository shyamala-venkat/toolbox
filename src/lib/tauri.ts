/**
 * Type-safe wrappers around Tauri `invoke()` for every Rust command exposed
 * by `src-tauri/src/lib.rs`. Frontend code should ALWAYS go through these
 * wrappers — never call `invoke()` directly. This gives us:
 *
 *   1. A single audit point for every IPC call.
 *   2. Compile-time argument and return-type safety.
 *   3. A trivial hook for future telemetry / rate limiting.
 */

import { invoke } from '@tauri-apps/api/core';

// ─── system ──────────────────────────────────────────────────────────────────

export const getPlatform = (): Promise<string> => invoke<string>('get_platform');

export const getArch = (): Promise<string> => invoke<string>('get_arch');

export const getAppVersion = (): Promise<string> => invoke<string>('get_app_version');

// ─── keychain ────────────────────────────────────────────────────────────────

export type KeychainProvider = 'openai' | 'anthropic' | 'google';

export const storeApiKey = (provider: KeychainProvider, key: string): Promise<void> =>
  invoke<void>('store_api_key', { provider, key });

export const getApiKey = (provider: KeychainProvider): Promise<string | null> =>
  invoke<string | null>('get_api_key', { provider });

/**
 * Non-sensitive summary of a stored API key. Use this for rendering the
 * "configured — ends in …abcd" status in settings without pulling the raw
 * secret into the renderer. The full key is only exposed via `getApiKey`,
 * which should be called from an explicit "Reveal" action.
 *
 * `last_four` is `null` when no key is stored. It mirrors Rust's
 * `Option::None` serialization, so the frontend should check `has_key` first.
 */
export interface ApiKeySummary {
  has_key: boolean;
  last_four: string | null;
}

export const getApiKeySummary = (provider: KeychainProvider): Promise<ApiKeySummary> =>
  invoke<ApiKeySummary>('get_api_key_summary', { provider });

export const deleteApiKey = (provider: KeychainProvider): Promise<void> =>
  invoke<void>('delete_api_key', { provider });

// ─── file ops ────────────────────────────────────────────────────────────────

export const readTextFile = (path: string): Promise<string> =>
  invoke<string>('read_text_file', { path });

export const writeTextFile = (path: string, content: string): Promise<void> =>
  invoke<void>('write_text_file', { path, content });

/** Write arbitrary bytes to a user-chosen path. The Rust handler enforces
 *  the same path validation + 100 MB cap as `writeTextFile`. */
export const writeBinaryFile = (path: string, content: Uint8Array): Promise<void> =>
  invoke<void>('write_binary_file', { path, content: Array.from(content) });

export const statFile = (path: string): Promise<number> =>
  invoke<number>('stat_file', { path });

// ─── crypto ──────────────────────────────────────────────────────────────────

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512' | 'crc32';

export const hashFile = (path: string, algorithm: HashAlgorithm): Promise<string> =>
  invoke<string>('hash_file', { path, algorithm });

export const hashText = (text: string, algorithm: HashAlgorithm): Promise<string> =>
  invoke<string>('hash_text', { text, algorithm });

// ─── preferences ─────────────────────────────────────────────────────────────

/**
 * Serialized shape of `UserPreferences` on the Rust side. Most keys are
 * snake_case because that's what `serde` emits by default and mirroring the
 * backend shape avoids a translation layer. The `history` slice is the lone
 * exception: its sub-struct uses `#[serde(rename_all = "camelCase")]` so the
 * frontend can pass the typed `HistoryDefaults` straight through. Zustand
 * store owns the camelCase surface for the rest of the fields.
 */
export interface RustUserPreferences {
  theme: 'system' | 'light' | 'dark';
  sidebar_collapsed: boolean;
  sidebar_width: number;
  smart_detection_enabled: boolean;
  auto_process_on_paste: boolean;
  clear_input_on_tool_switch: boolean;
  favorite_tool_ids: string[];
  recent_tool_ids: string[];
  compact_mode: boolean;
  minimize_to_tray: boolean;
  monospace_font_size: number;
  accent_color: string;
  tool_defaults: Record<string, unknown>;
  /**
   * Tool-history feature settings. Top-level field on the Rust side. Inner
   * field names are camelCase via `#[serde(rename_all = "camelCase")]`. May
   * be absent on older preference files; the frontend sanitizer treats
   * `undefined` as "use defaults".
   */
  history?: unknown;
}

export const getPreferences = (): Promise<RustUserPreferences> =>
  invoke<RustUserPreferences>('get_preferences');

export const setPreferences = (prefs: RustUserPreferences): Promise<void> =>
  invoke<void>('set_preferences', { prefs });

export const checkPreferencesRecovery = (): Promise<boolean> =>
  invoke<boolean>('check_preferences_recovery');

export const dismissPreferencesRecovery = (): Promise<void> =>
  invoke<void>('dismiss_preferences_recovery');

// ── Image operations ────────────────────────────────────────────────────────

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size_bytes: number;
}

export const getImageInfo = (path: string): Promise<ImageInfo> =>
  invoke<ImageInfo>('get_image_info', { path });

export const resizeImage = (
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  maintainAspect: boolean,
): Promise<ImageInfo> =>
  invoke<ImageInfo>('resize_image', {
    inputPath,
    outputPath,
    width,
    height,
    maintainAspect,
  });

export const convertImage = (
  inputPath: string,
  outputPath: string,
  quality?: number,
): Promise<ImageInfo> =>
  invoke<ImageInfo>('convert_image', { inputPath, outputPath, quality });

export const stripExif = (
  inputPath: string,
  outputPath: string,
): Promise<ImageInfo> =>
  invoke<ImageInfo>('strip_exif', { inputPath, outputPath });

export const readExif = (path: string): Promise<[string, string][]> =>
  invoke<[string, string][]>('read_exif', { path });

// ─── finance datasets ───────────────────────────────────────────────────────

export type FinanceDatasetName = 'fx-usd' | 'tax-fed';

/**
 * Result of `get_finance_dataset`. `data` is whatever JSON the dataset
 * carries; the consumer is expected to validate its shape before use.
 *
 * `source: 'overlay'` means the user has imported a snapshot which is now
 * shadowing the bundled file. `'bundled'` means we're serving the version
 * shipped with the app.
 */
export interface FinanceDatasetResponse {
  kind: string;
  data: unknown;
  source: 'overlay' | 'bundled';
  asOf: string;
}

export interface FxImportResult {
  asOf: string;
  currencies: string[];
}

export interface TaxImportResult {
  taxYear: number;
}

export const getFinanceDataset = (
  name: FinanceDatasetName,
): Promise<FinanceDatasetResponse> =>
  invoke<FinanceDatasetResponse>('get_finance_dataset', { name });

export const importFxSnapshot = (json: string): Promise<FxImportResult> =>
  invoke<FxImportResult>('import_fx_snapshot', { json });

export const importTaxSnapshot = (json: string): Promise<TaxImportResult> =>
  invoke<TaxImportResult>('import_tax_snapshot', { json });

export const resetFinanceOverlay = (
  name: FinanceDatasetName,
): Promise<void> => invoke<void>('reset_finance_overlay', { name });

// ─── history ─────────────────────────────────────────────────────────────────
//
// Wrappers for the SQLCipher-backed tool history store. Every command
// degrades gracefully when history is unavailable this session (keychain
// locked, init failure): Rust returns a string error and the frontend
// surfaces it as a disabled-drawer state. Frontend never throws past these
// wrappers — callers should `try/catch` and decide how to render.
//
// String-typed retention values are the wire contract: Rust accepts
// `"1d" | "7d" | "30d" | "forever"` and returns its own enum form. We
// keep the wire side here as the source of truth.

export type HistoryRetention = '1d' | '7d' | '30d' | 'forever';

/**
 * One row in the history. `input`/`output`/`params` are `null` for tombstone
 * rows AND for `listHistory` results (which the backend truncates to a
 * preview server-side). Use `getHistoryEntry` to fetch the full payload.
 */
export interface HistoryEntry {
  id: number;
  tool_id: string;
  /** ISO 8601 timestamp (`YYYY-MM-DDTHH:MM:SSZ`). */
  timestamp: string;
  input: string | null;
  output: string | null;
  params: unknown | null;
  redacted: boolean;
  reason: string | null;
  pinned: boolean;
  bytes: number;
}

/**
 * Result of `addHistoryEntry`.
 * - `stored: false` → the row was rejected outright (paused, unknown tool,
 *   oversize). `entry` is omitted; `reason` carries the rejection code.
 * - `stored: true` with `reason: null` → a full row was inserted; `entry`
 *   carries the canonical inserted row including its database id.
 * - `stored: true` with a non-null `reason` (e.g. `"blocklisted"` or
 *   `"sensitive_pattern:<id>"`) → a tombstone row was inserted; `entry`
 *   carries the tombstone row (redacted=true, NULL content, real id) so the
 *   UI can render the lock-badge entry immediately.
 */
export interface AddEntryResult {
  stored: boolean;
  reason: string | null;
  /** Canonical inserted row when `stored=true`. Absent on rejection. */
  entry?: HistoryEntry;
}

export interface StorageStats {
  entries: number;
  bytes_used: number;
  bytes_cap: number;
  tombstones: number;
  pins: number;
}

export interface PinHistoryResult {
  ok: boolean;
  /** `"pin_cap" | "is_tombstone" | "not_found"` when `ok = false`. */
  reason: string | null;
}

export interface ClearHistoryResult {
  removed: number;
}

export interface AddHistoryEntryArgs {
  toolId: string;
  input: string;
  output: string;
  params?: unknown;
}

export const addHistoryEntry = (args: AddHistoryEntryArgs): Promise<AddEntryResult> =>
  invoke<AddEntryResult>('add_history_entry', {
    args: {
      tool_id: args.toolId,
      input: args.input,
      output: args.output,
      params: args.params ?? {},
    },
  });

export interface ListHistoryArgs {
  toolId?: string;
  limit?: number;
  beforeTimestamp?: string;
}

export const listHistory = (args: ListHistoryArgs = {}): Promise<HistoryEntry[]> =>
  invoke<HistoryEntry[]>('list_history', {
    args: {
      tool_id: args.toolId ?? null,
      limit: args.limit ?? 50,
      before_timestamp: args.beforeTimestamp ?? null,
    },
  });

export const getHistoryEntry = (id: number): Promise<HistoryEntry | null> =>
  invoke<HistoryEntry | null>('get_history_entry', { args: { id } });

export const deleteHistoryEntry = (id: number): Promise<void> =>
  invoke<void>('delete_history_entry', { args: { id } });

export const clearHistory = (toolId?: string): Promise<ClearHistoryResult> =>
  invoke<ClearHistoryResult>('clear_history', {
    args: { tool_id: toolId ?? null },
  });

export const pinHistoryEntry = (id: number, pinned: boolean): Promise<PinHistoryResult> =>
  invoke<PinHistoryResult>('pin_history_entry', { args: { id, pinned } });

export const setHistoryPaused = (paused: boolean): Promise<void> =>
  invoke<void>('set_history_paused', { args: { paused } });

export const setHistoryRetention = (ttl: HistoryRetention): Promise<void> =>
  invoke<void>('set_history_retention', { args: { ttl } });

export const historyStorageStats = (): Promise<StorageStats> =>
  invoke<StorageStats>('history_storage_stats');
