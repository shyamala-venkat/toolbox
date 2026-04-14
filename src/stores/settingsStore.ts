/**
 * Persistent user preferences, mirrored to the Rust backend.
 *
 * Flow:
 *   1. `hydrate()` is called once at app start. It loads prefs from Rust,
 *      populates the store, and pushes favorite/recent lists into toolStore
 *      so the rest of the app reads a consistent snapshot.
 *   2. `update(partial)` shallow-merges into local state immediately and
 *      schedules a debounced save so rapid changes (toggles, slider drags)
 *      collapse into a single disk write.
 *   3. appStore.theme and toolStore favorite/recent are watched by thin
 *      subscriptions in Layout so external state changes automatically
 *      round-trip through `update()`.
 */

import { create } from 'zustand';
import {
  getPreferences,
  setPreferences,
  type RustUserPreferences,
} from '@/lib/tauri';
import { useAppStore } from './appStore';
import { useToolStore } from './toolStore';

const SAVE_DEBOUNCE_MS = 1000;

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  smartDetectionEnabled: boolean;
  autoProcessOnPaste: boolean;
  clearInputOnToolSwitch: boolean;
  favoriteToolIds: string[];
  recentToolIds: string[];
  compactMode: boolean;
  minimizeToTray: boolean;
  monospaceFontSize: number;
  accentColor: string;
  toolDefaults: Record<string, unknown>;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  sidebarWidth: 240,
  smartDetectionEnabled: true,
  autoProcessOnPaste: false,
  clearInputOnToolSwitch: false,
  favoriteToolIds: [],
  recentToolIds: [],
  compactMode: false,
  minimizeToTray: true,
  monospaceFontSize: 14,
  accentColor: 'teal',
  toolDefaults: {},
};

const fromRust = (r: RustUserPreferences): UserPreferences => ({
  theme: r.theme,
  sidebarCollapsed: r.sidebar_collapsed,
  sidebarWidth: r.sidebar_width,
  smartDetectionEnabled: r.smart_detection_enabled,
  autoProcessOnPaste: r.auto_process_on_paste,
  clearInputOnToolSwitch: r.clear_input_on_tool_switch,
  favoriteToolIds: r.favorite_tool_ids,
  recentToolIds: r.recent_tool_ids,
  compactMode: r.compact_mode,
  minimizeToTray: r.minimize_to_tray,
  monospaceFontSize: r.monospace_font_size,
  accentColor: r.accent_color || 'teal',
  toolDefaults:
    r.tool_defaults && typeof r.tool_defaults === 'object'
      ? (r.tool_defaults as Record<string, unknown>)
      : {},
});

const toRust = (p: UserPreferences): RustUserPreferences => ({
  theme: p.theme,
  sidebar_collapsed: p.sidebarCollapsed,
  sidebar_width: p.sidebarWidth,
  smart_detection_enabled: p.smartDetectionEnabled,
  auto_process_on_paste: p.autoProcessOnPaste,
  clear_input_on_tool_switch: p.clearInputOnToolSwitch,
  favorite_tool_ids: p.favoriteToolIds,
  recent_tool_ids: p.recentToolIds,
  compact_mode: p.compactMode,
  minimize_to_tray: p.minimizeToTray,
  monospace_font_size: p.monospaceFontSize,
  accent_color: p.accentColor,
  tool_defaults: p.toolDefaults,
});

interface SettingsStoreState {
  preferences: UserPreferences;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  update: (partial: Partial<UserPreferences>) => void;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleSave = (prefs: UserPreferences): void => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    setPreferences(toRust(prefs)).catch((err) => {
      // Surface the failure via toast — but never include the preferences
      // blob in the error text (it might leak tool_defaults contents).
      const message = typeof err === 'string' ? err : 'failed to save preferences';
      useAppStore.getState().showToast(message, 'error');
    });
  }, SAVE_DEBOUNCE_MS);
};

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  isHydrated: false,

  hydrate: async () => {
    try {
      const rust = await getPreferences();
      const prefs = fromRust(rust);
      set({ preferences: prefs, isHydrated: true });
      // Reconcile into the other stores so UI reads a single consistent
      // snapshot. These calls are deliberate and one-way on boot.
      useAppStore.getState().setTheme(prefs.theme);
      useAppStore.getState().setSidebarCollapsed(prefs.sidebarCollapsed);
      useToolStore.getState().setFavoriteToolIds(prefs.favoriteToolIds);
      useToolStore.getState().setRecentToolIds(prefs.recentToolIds);
    } catch {
      // Swallow: defaults are already in place, the user can still use the
      // app. We intentionally do NOT surface this as an error toast because
      // first-run users will always hit a missing-file path.
      set({ isHydrated: true });
    }
  },

  update: (partial) => {
    const next = { ...get().preferences, ...partial };
    set({ preferences: next });
    if (get().isHydrated) {
      scheduleSave(next);
    }
  },

  reset: () => {
    set({ preferences: DEFAULT_PREFERENCES });
    if (get().isHydrated) {
      scheduleSave(DEFAULT_PREFERENCES);
    }
  },
}));
