/**
 * Tool-history store (PR-A: Settings-only flags · PR-B.1: per-tool row state).
 *
 * Holds the live, per-session view of:
 *   - global pause flag (mirrors the Rust store's session flag)
 *   - retention TTL ('1d' | '7d' | '30d' | 'forever')
 *   - last-known storage stats (entries / bytes / tombstones / pins)
 *   - whether the first sensitive-block toast has been dismissed
 *   - per-tool entry lists keyed by `tool_id` (PR-B.1)
 *
 * The pause + retention values are also mirrored into `settingsStore`'s
 * `history` slice so they survive a restart. The Rust IPC commands
 * (`set_history_paused`, `set_history_retention`) update the running store's
 * in-memory flags; mirroring into preferences gives us cross-session
 * persistence and lets the drawer read them without an extra IPC round-trip.
 *
 * All settings actions are optimistic: we update local state first, fire the
 * IPC, and roll back on failure with a toast. Drawer mutations (`addEntry`,
 * `removeEntry`, `togglePin`) are also optimistic: row list is updated
 * immediately; IPC failures roll back and surface a toast.
 *
 * Per-tool entries shape:
 *   - `entriesByTool[toolId] === undefined` → never fetched this session
 *   - `entriesByTool[toolId] === null`      → fetch in flight (cleared on
 *     completion regardless of outcome)
 *   - `entriesByTool[toolId] === []`        → loaded, empty
 *   - `entriesByTool[toolId] === [...]`     → loaded, populated
 *
 * Errors live separately in `errorByTool[toolId]` so a failed fetch does NOT
 * silently leave the slice as `undefined` — the drawer reads the error slice
 * to render the "history temporarily unavailable" state and the [Retry]
 * action.
 *
 * Toast lifecycle:
 *   - `firstBlockToastDismissed` mirrors the persisted preference (across
 *     restarts).
 *   - `firstBlockToastShown` is a transient per-session flag flipped the
 *     first time the toast is shown so two near-simultaneous sensitive IPC
 *     results don't re-trigger it.
 */

import { create } from 'zustand';
import {
  setHistoryPaused as ipcSetPaused,
  setHistoryRetention as ipcSetRetention,
  clearHistory as ipcClearHistory,
  historyStorageStats as ipcStorageStats,
  listHistory as ipcListHistory,
  getHistoryEntry as ipcGetHistoryEntry,
  deleteHistoryEntry as ipcDeleteHistoryEntry,
  pinHistoryEntry as ipcPinHistoryEntry,
  type HistoryRetention,
  type HistoryEntry,
  type StorageStats,
} from '@/lib/tauri';
import { useAppStore } from './appStore';
import { useSettingsStore } from './settingsStore';
import { redactedError } from '@/lib/redactedError';

interface HistoryStoreState {
  paused: boolean;
  retention: HistoryRetention;
  stats: StorageStats | null;
  /** Persisted across launches via the settings store. */
  firstBlockToastDismissed: boolean;
  /** Per-session flag: flipped eagerly the first time the toast is shown so
   *  two near-simultaneous sensitive IPC results do not re-trigger it. Not
   *  persisted — every fresh session can show the toast at most once. */
  firstBlockToastShown: boolean;
  /** Tracks the most recent stats fetch. Used by Settings to render a tiny
   *  refreshing indicator without driving a re-render storm. */
  isStatsLoading: boolean;

  /**
   * Per-tool row lists. Use `undefined` to mean "never fetched" so callers
   * can decide between rendering a skeleton vs the empty state. The drawer
   * subscribes via `useHistoryStore((s) => s.entriesByTool[toolId])` to keep
   * unrelated tool slices from invalidating its render.
   */
  entriesByTool: Record<string, HistoryEntry[] | null | undefined>;
  /** Fetch-in-flight set keyed by `tool_id`. Prevents thundering-herd on
   *  rapid drawer expand/collapse. */
  fetchingByTool: Record<string, boolean>;
  /** Per-tool error message, populated when `fetchEntries` fails. The drawer
   *  surfaces an "unavailable + retry" branch when this is set; a successful
   *  retry clears it. */
  errorByTool: Record<string, string | null>;

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

  // ─── PR-B.1 row-list actions ────────────────────────────────────────────

  /**
   * Load (or refresh) the most recent 50 entries for a tool. Idempotent: a
   * concurrent call while a fetch is in flight is a no-op. On failure the
   * error message is recorded into `errorByTool[toolId]` so the drawer can
   * render its "unavailable + retry" branch instead of an infinite skeleton.
   */
  fetchEntries: (toolId: string) => Promise<void>;
  /** Clear the recorded error for a tool and refetch. Used by the drawer's
   *  [Retry] button in the unavailable state. */
  retryFetch: (toolId: string) => Promise<void>;
  /**
   * Optimistically prepend a freshly captured entry. Called from
   * `useHistoryCapture` after a successful `add_history_entry`. If the
   * tool's slice has not been hydrated yet, this is a no-op — the next
   * `fetchEntries` will read it from Rust.
   */
  addEntry: (toolId: string, entry: HistoryEntry) => void;
  /** Optimistically remove a row, then call delete IPC. On failure the row
   *  is restored and a toast is shown. */
  removeEntry: (toolId: string, id: number) => Promise<void>;
  /**
   * Toggle the pinned flag for a row. Optimistic. On failure the previous
   * state is restored; if the failure reason is `pin_cap` the toast says
   * "Unpin one to pin another."
   */
  togglePin: (toolId: string, id: number) => Promise<void>;
  /** Fetch a full (non-truncated) entry. Used by the detail panel to render
   *  input + output. Returns `null` if the row no longer exists. */
  getDetailEntry: (id: number) => Promise<HistoryEntry | null>;
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
  firstBlockToastShown: false,
  isStatsLoading: false,
  entriesByTool: {},
  fetchingByTool: {},
  errorByTool: {},

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
      // Refresh after clear so the storage indicator drops to 0. Also blow
      // away every per-tool slice so open drawers re-render to empty state.
      await get().refreshStats();
      set({ entriesByTool: {}, errorByTool: {} });
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

  // ─── Row-list actions (PR-B.1) ─────────────────────────────────────────

  fetchEntries: async (toolId) => {
    if (get().fetchingByTool[toolId]) return;
    set((state) => ({
      fetchingByTool: { ...state.fetchingByTool, [toolId]: true },
    }));
    try {
      const rows = await ipcListHistory({ toolId, limit: 50 });
      set((state) => ({
        entriesByTool: { ...state.entriesByTool, [toolId]: rows },
        fetchingByTool: { ...state.fetchingByTool, [toolId]: false },
        errorByTool: { ...state.errorByTool, [toolId]: null },
      }));
    } catch (err) {
      // Record the error so the drawer can render the "history unavailable"
      // branch with a retry action, and ALWAYS clear the in-flight flag so
      // the drawer doesn't sit on a perpetual skeleton.
      const message = typeof err === 'string' ? err : 'history unavailable';
      set((state) => ({
        fetchingByTool: { ...state.fetchingByTool, [toolId]: false },
        errorByTool: { ...state.errorByTool, [toolId]: message },
      }));
    }
  },

  retryFetch: async (toolId) => {
    set((state) => ({
      errorByTool: { ...state.errorByTool, [toolId]: null },
    }));
    await get().fetchEntries(toolId);
  },

  addEntry: (toolId, entry) => {
    set((state) => {
      const existing = state.entriesByTool[toolId];
      // If we never loaded this tool's slice, leave it untouched — a future
      // `fetchEntries` will paginate the canonical list from Rust. Adding
      // here would risk presenting a partial list as authoritative.
      if (!existing) return state;
      return {
        entriesByTool: {
          ...state.entriesByTool,
          [toolId]: [entry, ...existing.filter((e) => e.id !== entry.id)],
        },
      };
    });
  },

  removeEntry: async (toolId, id) => {
    const existing = get().entriesByTool[toolId];
    const previous = existing ?? null;
    if (existing) {
      set((state) => ({
        entriesByTool: {
          ...state.entriesByTool,
          [toolId]: existing.filter((row) => row.id !== id),
        },
      }));
    }
    try {
      await ipcDeleteHistoryEntry(id);
    } catch (err) {
      // Roll back to the pre-delete view.
      if (previous) {
        set((state) => ({
          entriesByTool: { ...state.entriesByTool, [toolId]: previous },
        }));
      }
      const message = typeof err === 'string' ? err : 'Could not delete entry';
      showToast(message, 'error');
    }
  },

  togglePin: async (toolId, id) => {
    const existing = get().entriesByTool[toolId];
    if (!existing) return;
    const target = existing.find((row) => row.id === id);
    if (!target) return;
    const nextPinned = !target.pinned;
    set((state) => ({
      entriesByTool: {
        ...state.entriesByTool,
        [toolId]: (state.entriesByTool[toolId] ?? []).map((row) =>
          row.id === id ? { ...row, pinned: nextPinned } : row,
        ),
      },
    }));
    try {
      const result = await ipcPinHistoryEntry(id, nextPinned);
      if (!result.ok) {
        // Rollback. Distinguish pin_cap so the toast is actionable.
        set((state) => ({
          entriesByTool: {
            ...state.entriesByTool,
            [toolId]: (state.entriesByTool[toolId] ?? []).map((row) =>
              row.id === id ? { ...row, pinned: target.pinned } : row,
            ),
          },
        }));
        if (result.reason === 'pin_cap') {
          showToast('Unpin one to pin another.', 'error');
        } else if (result.reason === 'is_tombstone') {
          showToast('Sensitive entries cannot be pinned.', 'error');
        } else {
          showToast('Could not pin entry', 'error');
        }
      }
    } catch (err) {
      set((state) => ({
        entriesByTool: {
          ...state.entriesByTool,
          [toolId]: (state.entriesByTool[toolId] ?? []).map((row) =>
            row.id === id ? { ...row, pinned: target.pinned } : row,
          ),
        },
      }));
      const message = typeof err === 'string' ? err : 'Could not pin entry';
      showToast(message, 'error');
    }
  },

  getDetailEntry: async (id) => {
    try {
      return await ipcGetHistoryEntry(id);
    } catch {
      return null;
    }
  },
}));
