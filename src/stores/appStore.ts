/**
 * Global app state: sidebar, command palette, theme, toast.
 *
 * This store does NOT persist to disk — persistence lives in `settingsStore`,
 * which mirrors a subset of this state and pushes changes to the Rust backend.
 * Keeping the two stores separate avoids round-tripping transient UI state
 * (toast, palette open) through the filesystem.
 */

import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface AppStoreState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Command palette
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Theme
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  setResolvedTheme: (resolved: ResolvedTheme) => void;

  // Toast
  toast: Toast | null;
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
  dismissToast: () => void;
}

/** Read the actual system preference. Separated so tests can mock it. */
const readSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? readSystemTheme() : theme;

let nextToastId = 1;

export const useAppStore = create<AppStoreState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),

  theme: 'system',
  resolvedTheme: readSystemTheme(),
  setTheme: (theme) => set({ theme, resolvedTheme: resolveTheme(theme) }),
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),

  toast: null,
  showToast: (message, type = 'info', action) =>
    set({ toast: { id: nextToastId++, message, type, action } }),
  dismissToast: () => set({ toast: null }),
}));

/**
 * Apply the resolved theme to the root element. Called from Layout on
 * `resolvedTheme` changes so the CSS variables flip atomically.
 */
export const applyThemeToDocument = (resolved: ResolvedTheme): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
};
