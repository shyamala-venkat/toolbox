import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { UpdateBanner } from '@/components/UpdateBanner';
import { Toast } from '@/components/ui/Toast';
import { applyThemeToDocument, useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useFavoriteTools } from '@/stores/toolStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

/**
 * The top-level application chrome.
 *
 * Responsibilities:
 *   1. Hydrate persisted preferences into the store on first mount.
 *   2. Watch the system dark-mode media query so `theme === 'system'` tracks
 *      changes at runtime.
 *   3. Mirror transient state (sidebarCollapsed, theme) back into
 *      settingsStore so it persists across sessions.
 *   4. Register global keyboard shortcuts.
 *   5. Render the sidebar, main outlet, command palette, and toast surface.
 */
export function Layout() {
  const navigate = useNavigate();

  const theme = useAppStore((s) => s.theme);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setResolvedTheme = useAppStore((s) => s.setResolvedTheme);

  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useAppStore((s) => s.toggleCommandPalette);
  const closeCommandPalette = useAppStore((s) => s.closeCommandPalette);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);

  const hydrate = useSettingsStore((s) => s.hydrate);
  const isHydrated = useSettingsStore((s) => s.isHydrated);
  const updatePreferences = useSettingsStore((s) => s.update);

  const favorites = useFavoriteTools();

  // Hydrate preferences once on mount.
  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [isHydrated, hydrate]);

  // Check if preferences were recovered from a corrupted file. If so, show
  // a toast so the user knows their settings were reset to defaults.
  useEffect(() => {
    const check = async () => {
      try {
        const { checkPreferencesRecovery, dismissPreferencesRecovery } = await import('@/lib/tauri');
        const hasRecovery = await checkPreferencesRecovery();
        if (hasRecovery) {
          useAppStore.getState().showToast(
            'Your settings were reset because the preferences file was corrupted. A backup was saved as preferences.json.bad.',
            'warning',
          );
          await dismissPreferencesRecovery();
        }
      } catch {
        // Silently ignore — this is a best-effort notification.
      }
    };
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the system color scheme for 'system' theme.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => {
      if (useAppStore.getState().theme === 'system') {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [setResolvedTheme]);

  // Apply the resolved theme to <html> and persist the user choice.
  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
    try {
      localStorage.setItem('tb-theme', theme);
    } catch {
      // localStorage can be disabled; we already have Rust persistence.
    }
  }, [resolvedTheme, theme]);

  // Round-trip theme choice into settingsStore (debounced save).
  useEffect(() => {
    if (!isHydrated) return;
    updatePreferences({ theme });
  }, [theme, isHydrated, updatePreferences]);

  // Round-trip sidebar state into settingsStore.
  useEffect(() => {
    if (!isHydrated) return;
    updatePreferences({ sidebarCollapsed });
  }, [sidebarCollapsed, isHydrated, updatePreferences]);

  // Global keyboard shortcuts ─────────────────────────────────────────────

  useKeyboardShortcut('mod+k', toggleCommandPalette, { global: true });
  useKeyboardShortcut('mod+,', () => navigate('/settings'), { global: true });
  useKeyboardShortcut('mod+d', toggleSidebar, { global: true });
  useKeyboardShortcut('escape', closeCommandPalette, {
    global: true,
    preventDefault: false,
    enabled: commandPaletteOpen,
  });

  // Favorites 1-9 quick-switch
  useKeyboardShortcut('mod+1', () => favorites[0] && navigate(`/tools/${favorites[0].id}`), { global: true });
  useKeyboardShortcut('mod+2', () => favorites[1] && navigate(`/tools/${favorites[1].id}`), { global: true });
  useKeyboardShortcut('mod+3', () => favorites[2] && navigate(`/tools/${favorites[2].id}`), { global: true });
  useKeyboardShortcut('mod+4', () => favorites[3] && navigate(`/tools/${favorites[3].id}`), { global: true });
  useKeyboardShortcut('mod+5', () => favorites[4] && navigate(`/tools/${favorites[4].id}`), { global: true });
  useKeyboardShortcut('mod+6', () => favorites[5] && navigate(`/tools/${favorites[5].id}`), { global: true });
  useKeyboardShortcut('mod+7', () => favorites[6] && navigate(`/tools/${favorites[6].id}`), { global: true });
  useKeyboardShortcut('mod+8', () => favorites[7] && navigate(`/tools/${favorites[7].id}`), { global: true });
  useKeyboardShortcut('mod+9', () => favorites[8] && navigate(`/tools/${favorites[8].id}`), { global: true });

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main
          className="flex min-w-0 flex-1 flex-col overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <Toast />
    </div>
  );
}
