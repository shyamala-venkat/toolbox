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
 * Serialized shape of `UserPreferences` on the Rust side. Keys are snake_case
 * because that's what `serde` emits by default and mirroring the backend shape
 * avoids a translation layer. Zustand store owns the camelCase surface.
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
  monospace_font_size: number;
  tool_defaults: Record<string, unknown>;
}

export const getPreferences = (): Promise<RustUserPreferences> =>
  invoke<RustUserPreferences>('get_preferences');

export const setPreferences = (prefs: RustUserPreferences): Promise<void> =>
  invoke<void>('set_preferences', { prefs });
