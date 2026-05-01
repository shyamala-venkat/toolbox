import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the IPC wrappers so the store never actually invokes Tauri.
vi.mock('@/lib/tauri', () => ({
  setHistoryPaused: vi.fn(),
  setHistoryRetention: vi.fn(),
  clearHistory: vi.fn(),
  historyStorageStats: vi.fn(),
}));

import {
  setHistoryPaused as mockSetPaused,
  setHistoryRetention as mockSetRetention,
  clearHistory as mockClearHistory,
  historyStorageStats as mockStorageStats,
  type StorageStats,
} from '@/lib/tauri';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { DEFAULT_HISTORY_DEFAULTS } from '@/lib/sanitizeHistoryDefaults';

const SAMPLE_STATS: StorageStats = {
  entries: 12,
  bytes_used: 4096,
  bytes_cap: 50 * 1024 * 1024,
  tombstones: 1,
  pins: 0,
};

const resetSettingsStore = (): void => {
  useSettingsStore.setState({
    isHydrated: true,
    preferences: {
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
      history: { ...DEFAULT_HISTORY_DEFAULTS, perToolPaused: {} },
    },
  });
};

const resetHistoryStore = (): void => {
  useHistoryStore.setState({
    paused: false,
    retention: '7d',
    stats: null,
    firstBlockToastDismissed: false,
    isStatsLoading: false,
  });
};

beforeEach(() => {
  resetSettingsStore();
  resetHistoryStore();
  // Reset toast so failures from a previous test don't bleed.
  useAppStore.setState({ toast: null });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('historyStore.togglePause', () => {
  it('calls set_history_paused with the inverted value and updates state', async () => {
    vi.mocked(mockSetPaused).mockResolvedValueOnce(undefined);

    await useHistoryStore.getState().togglePause();

    expect(mockSetPaused).toHaveBeenCalledTimes(1);
    expect(mockSetPaused).toHaveBeenCalledWith(true);
    expect(useHistoryStore.getState().paused).toBe(true);
  });

  it('mirrors the new pause value into preferences', async () => {
    vi.mocked(mockSetPaused).mockResolvedValueOnce(undefined);

    await useHistoryStore.getState().togglePause();

    expect(useSettingsStore.getState().preferences.history.paused).toBe(true);
  });

  it('rolls back local state and shows a toast on failure', async () => {
    vi.mocked(mockSetPaused).mockRejectedValueOnce('keychain locked');

    await useHistoryStore.getState().togglePause();

    expect(useHistoryStore.getState().paused).toBe(false);
    expect(useAppStore.getState().toast?.type).toBe('error');
    expect(useAppStore.getState().toast?.message).toBe('keychain locked');
  });
});

describe('historyStore.setRetention', () => {
  it('calls set_history_retention with the new ttl and updates state', async () => {
    vi.mocked(mockSetRetention).mockResolvedValueOnce(undefined);
    vi.mocked(mockStorageStats).mockResolvedValueOnce(SAMPLE_STATS);

    await useHistoryStore.getState().setRetention('30d');

    expect(mockSetRetention).toHaveBeenCalledWith('30d');
    expect(useHistoryStore.getState().retention).toBe('30d');
    expect(useSettingsStore.getState().preferences.history.retention).toBe('30d');
  });

  it('skips the IPC when the retention is unchanged', async () => {
    await useHistoryStore.getState().setRetention('7d');

    expect(mockSetRetention).not.toHaveBeenCalled();
  });

  it('rolls back local state on failure', async () => {
    vi.mocked(mockSetRetention).mockRejectedValueOnce('disk error');

    await useHistoryStore.getState().setRetention('1d');

    expect(useHistoryStore.getState().retention).toBe('7d');
    expect(useAppStore.getState().toast?.type).toBe('error');
  });

  it('triggers a stats refresh on success (TTL sweep may shrink rows)', async () => {
    vi.mocked(mockSetRetention).mockResolvedValueOnce(undefined);
    vi.mocked(mockStorageStats).mockResolvedValueOnce(SAMPLE_STATS);

    await useHistoryStore.getState().setRetention('30d');
    // refreshStats fires-and-forgets via void; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockStorageStats).toHaveBeenCalled();
  });
});

describe('historyStore.clearAll', () => {
  it('calls clear_history then refreshes stats', async () => {
    vi.mocked(mockClearHistory).mockResolvedValueOnce({ removed: 12 });
    vi.mocked(mockStorageStats).mockResolvedValueOnce({
      ...SAMPLE_STATS,
      entries: 0,
      bytes_used: 0,
    });

    await useHistoryStore.getState().clearAll();

    expect(mockClearHistory).toHaveBeenCalledTimes(1);
    expect(mockStorageStats).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().stats?.entries).toBe(0);
    expect(useAppStore.getState().toast?.type).toBe('success');
  });

  it('shows an error toast and does not refresh stats on failure', async () => {
    vi.mocked(mockClearHistory).mockRejectedValueOnce('db locked');

    await useHistoryStore.getState().clearAll();

    expect(useAppStore.getState().toast?.type).toBe('error');
    expect(mockStorageStats).not.toHaveBeenCalled();
  });
});

describe('historyStore.refreshStats', () => {
  it('hydrates stats from the IPC response', async () => {
    vi.mocked(mockStorageStats).mockResolvedValueOnce(SAMPLE_STATS);

    await useHistoryStore.getState().refreshStats();

    expect(useHistoryStore.getState().stats).toEqual(SAMPLE_STATS);
    expect(useHistoryStore.getState().isStatsLoading).toBe(false);
  });

  it('keeps the previous stats on failure (silent)', async () => {
    useHistoryStore.setState({ stats: SAMPLE_STATS });
    vi.mocked(mockStorageStats).mockRejectedValueOnce('history is unavailable');

    await useHistoryStore.getState().refreshStats();

    expect(useHistoryStore.getState().stats).toEqual(SAMPLE_STATS);
    // No toast — refreshStats failures are intentionally silent.
    expect(useAppStore.getState().toast).toBeNull();
  });

  it('skips a concurrent refresh if one is already in flight', async () => {
    let resolveFn!: (value: StorageStats) => void;
    const pending = new Promise<StorageStats>((r) => {
      resolveFn = r;
    });
    vi.mocked(mockStorageStats).mockImplementationOnce(() => pending);

    const first = useHistoryStore.getState().refreshStats();
    const second = useHistoryStore.getState().refreshStats();

    expect(mockStorageStats).toHaveBeenCalledTimes(1);
    resolveFn(SAMPLE_STATS);
    await first;
    await second;
  });
});

describe('historyStore.dismissFirstBlockToast', () => {
  it('flips the local flag and persists into preferences', () => {
    useHistoryStore.getState().dismissFirstBlockToast();

    expect(useHistoryStore.getState().firstBlockToastDismissed).toBe(true);
    expect(
      useSettingsStore.getState().preferences.history.firstBlockToastDismissed,
    ).toBe(true);
  });

  it('is a no-op when already dismissed', () => {
    useHistoryStore.getState().dismissFirstBlockToast();
    const settingsBefore = useSettingsStore.getState().preferences;

    useHistoryStore.getState().dismissFirstBlockToast();

    // Same reference — the second call did not push another update.
    expect(useSettingsStore.getState().preferences).toBe(settingsBefore);
  });
});

describe('historyStore.syncFromPreferences', () => {
  it('mirrors paused / retention / dismissed flag from settings', () => {
    useSettingsStore.setState({
      preferences: {
        ...useSettingsStore.getState().preferences,
        history: {
          drawerExpanded: false,
          paused: true,
          retention: '30d',
          firstBlockToastDismissed: true,
          perToolPaused: {},
        },
      },
    });

    useHistoryStore.getState().syncFromPreferences();

    expect(useHistoryStore.getState().paused).toBe(true);
    expect(useHistoryStore.getState().retention).toBe('30d');
    expect(useHistoryStore.getState().firstBlockToastDismissed).toBe(true);
  });
});
