/**
 * Tool-history store (PR-A scope: Settings → History only).
 *
 * Holds the live, per-session view of:
 *   - global pause flag (mirrors the Rust store's session flag)
 *   - retention TTL ('1d' | '7d' | '30d' | 'forever')
 *   - last-known storage stats (entries / bytes / tombstones / pins)
 *   - whether the first sensitive-block toast has been dismissed
 *
 * The pause + retention values are also mirrored into `settingsStore`'s
 * `history` slice so they survive a restart. The Rust IPC commands
 * (`set_history_paused`, `set_history_retention`) update the running store's
 * in-memory flags; mirroring into preferences gives us cross-session
 * persistence today and lets PR-B's drawer read them without an extra IPC
 * round-trip.
 *
 * All actions are optimistic: we update local state first, fire the IPC,
 * and roll back on failure with a toast. This keeps Settings UI responsive
 * even if the Rust side is slow to respond.
 *
 * PR-B will add: refreshFromList, capture-driven entry mutation, drawer
 * collapse state.
 */

import { create } from 'zustand';
import {
  setHistoryPaused as ipcSetPaused,
  setHistoryRetention as ipcSetRetention,
  clearHistory as ipcClearHistory,
  historyStorageStats as ipcStorageStats,
  type HistoryRetention,
  type StorageStats,
} from '@/lib/tauri';
import { useAppStore } from './appStore';
import { useSettingsStore } from './settingsStore';
import { redactedError } from '@/lib/redactedError';

interface HistoryStoreState {
  paused: boolean;
  retention: HistoryRetention;
  stats: StorageStats | null;
  firstBlockToastDismissed: boolean;
  /** Tracks the most recent stats fetch. Used by Settings to render a tiny
   *  refreshing indicator without driving a re-render storm. */
  isStatsLoading: boolean;

  /** Toggle the global pause flag. Optimistic; rolls back on IPC failure. */
  togglePause: () => Promise<void>;
  /** Set retention TTL. Optimistic; rolls back on failure. */
  setRetention: (ttl: HistoryRetention) => Promise<void>;
  /** Wipe ALL history rows (across every tool). Refreshes stats on success. */
  clearAll: () => Promise<void>;
  /** Pull latest stats from Rust. Failures are silent — Settings shows the
   *  last known good stats. */
  refreshStats: () => Promise<void>;
  /** Persist the dismissed-toast flag both locally and into preferences. */
  dismissFirstBlockToast: () => void;
  /** Hydrate `paused` / `retention` / `firstBlockToastDismissed` from the
   *  preferences store. Idempotent. */
  syncFromPreferences: () => void;
}

const showToast = (message: string, type: 'success' | 'error'): void => {
  useAppStore.getState().showToast(redactedError(message, message), type);
};

const persistToPrefs = (
  patch: Partial<{
    paused: boolean;
    retention: HistoryRetention;
    firstBlockToastDismissed: boolean;
  }>,
): void => {
  const settings = useSettingsStore.getState();
  settings.update({
    history: {
      ...settings.preferences.history,
      ...patch,
    },
  });
};

export const useHistoryStore = create<HistoryStoreState>((set, get) => ({
  paused: false,
  retention: '7d',
  stats: null,
  firstBlockToastDismissed: false,
  isStatsLoading: false,

  togglePause: async () => {
    const previous = get().paused;
    const next = !previous;
    set({ paused: next });
    try {
      await ipcSetPaused(next);
      persistToPrefs({ paused: next });
    } catch (err) {
      // Roll back on failure so the toggle reflects ground truth.
      set({ paused: previous });
      const message = typeof err === 'string' ? err : 'Could not update pause setting';
      showToast(message, 'error');
    }
  },

  setRetention: async (ttl) => {
    const previous = get().retention;
    if (previous === ttl) return;
    set({ retention: ttl });
    try {
      await ipcSetRetention(ttl);
      persistToPrefs({ retention: ttl });
      // Retention changes can shrink the live row count via TTL sweep, so
      // refresh stats opportunistically. Failure is silent.
      void get().refreshStats();
    } catch (err) {
      set({ retention: previous });
      const message = typeof err === 'string' ? err : 'Could not update retention';
      showToast(message, 'error');
    }
  },

  clearAll: async () => {
    try {
      await ipcClearHistory();
      // Refresh after clear so the storage indicator drops to 0.
      await get().refreshStats();
      showToast('History cleared', 'success');
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Could not clear history';
      showToast(message, 'error');
    }
  },

  refreshStats: async () => {
    if (get().isStatsLoading) return;
    set({ isStatsLoading: true });
    try {
      const stats = await ipcStorageStats();
      set({ stats, isStatsLoading: false });
    } catch {
      // Silent: keep the previous stats visible. The "history unavailable"
      // banner in Settings is driven by `stats === null` AFTER a refresh
      // attempt, so we surface that case explicitly.
      set({ isStatsLoading: false });
    }
  },

  dismissFirstBlockToast: () => {
    if (get().firstBlockToastDismissed) return;
    set({ firstBlockToastDismissed: true });
    persistToPrefs({ firstBlockToastDismissed: true });
  },

  syncFromPreferences: () => {
    const { paused, retention, firstBlockToastDismissed } =
      useSettingsStore.getState().preferences.history;
    set({ paused, retention, firstBlockToastDismissed });
  },
}));
