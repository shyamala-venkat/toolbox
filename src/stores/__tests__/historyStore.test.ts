import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the IPC wrappers so the store never actually invokes Tauri.
vi.mock('@/lib/tauri', () => ({
  setHistoryPaused: vi.fn(),
  setHistoryRetention: vi.fn(),
  clearHistory: vi.fn(),
  historyStorageStats: vi.fn(),
  listHistory: vi.fn(),
  getHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  pinHistoryEntry: vi.fn(),
}));

import {
  setHistoryPaused as mockSetPaused,
  setHistoryRetention as mockSetRetention,
  clearHistory as mockClearHistory,
  historyStorageStats as mockStorageStats,
  listHistory as mockListHistory,
  getHistoryEntry as mockGetEntry,
  deleteHistoryEntry as mockDeleteEntry,
  pinHistoryEntry as mockPinEntry,
  type HistoryEntry,
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
    firstBlockToastShown: false,
    isStatsLoading: false,
    entriesByTool: {},
    fetchingByTool: {},
    errorByTool: {},
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

// ─── Row-list actions (PR-B.1) ─────────────────────────────────────────

const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 1,
  tool_id: 'json-formatter',
  timestamp: '2026-04-30T12:00:00Z',
  input: 'preview',
  output: 'preview',
  params: {},
  redacted: false,
  reason: null,
  pinned: false,
  bytes: 14,
  ...overrides,
});

describe('historyStore.fetchEntries', () => {
  it('hydrates the per-tool slice with the IPC response', async () => {
    const rows = [makeEntry({ id: 7 }), makeEntry({ id: 6 })];
    vi.mocked(mockListHistory).mockResolvedValueOnce(rows);

    await useHistoryStore.getState().fetchEntries('json-formatter');

    expect(mockListHistory).toHaveBeenCalledWith({ toolId: 'json-formatter', limit: 50 });
    expect(useHistoryStore.getState().entriesByTool['json-formatter']).toEqual(rows);
  });

  it('skips a concurrent fetch for the same tool', async () => {
    let resolveFn!: (rows: HistoryEntry[]) => void;
    const pending = new Promise<HistoryEntry[]>((r) => {
      resolveFn = r;
    });
    vi.mocked(mockListHistory).mockImplementationOnce(() => pending);

    const first = useHistoryStore.getState().fetchEntries('json-formatter');
    const second = useHistoryStore.getState().fetchEntries('json-formatter');

    expect(mockListHistory).toHaveBeenCalledTimes(1);
    resolveFn([]);
    await first;
    await second;
  });

  it('leaves the slice unchanged on IPC failure', async () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 1 })] },
    });
    vi.mocked(mockListHistory).mockRejectedValueOnce('keychain locked');

    await useHistoryStore.getState().fetchEntries('json-formatter');

    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.[0]?.id,
    ).toBe(1);
  });

  it('records an error and clears the in-flight flag on IPC failure', async () => {
    // C4: a failed fetch must NOT leave `fetchingByTool` set — the drawer
    // would render its skeleton forever. The error message lands in
    // `errorByTool` so the drawer can render its retry branch instead.
    vi.mocked(mockListHistory).mockRejectedValueOnce('keychain locked');

    await useHistoryStore.getState().fetchEntries('json-formatter');

    expect(useHistoryStore.getState().fetchingByTool['json-formatter']).toBe(false);
    expect(useHistoryStore.getState().errorByTool['json-formatter']).toBe('keychain locked');
  });
});

describe('historyStore.retryFetch', () => {
  it('clears the recorded error and refires the IPC', async () => {
    useHistoryStore.setState({
      errorByTool: { 'json-formatter': 'keychain locked' },
    });
    vi.mocked(mockListHistory).mockResolvedValueOnce([makeEntry({ id: 7 })]);

    await useHistoryStore.getState().retryFetch('json-formatter');

    expect(mockListHistory).toHaveBeenCalledWith({
      toolId: 'json-formatter',
      limit: 50,
    });
    expect(useHistoryStore.getState().errorByTool['json-formatter']).toBeNull();
    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.map((r) => r.id),
    ).toEqual([7]);
  });

  it('re-records the error if the retry also fails', async () => {
    useHistoryStore.setState({
      errorByTool: { 'json-formatter': 'keychain locked' },
    });
    vi.mocked(mockListHistory).mockRejectedValueOnce('still locked');

    await useHistoryStore.getState().retryFetch('json-formatter');

    expect(useHistoryStore.getState().errorByTool['json-formatter']).toBe('still locked');
  });
});

describe('historyStore.addEntry', () => {
  it('prepends to the existing slice', () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 1 })] },
    });

    useHistoryStore.getState().addEntry('json-formatter', makeEntry({ id: 2 }));

    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.map((r) => r.id),
    ).toEqual([2, 1]);
  });

  it('is a no-op when the slice was never fetched', () => {
    useHistoryStore.getState().addEntry('json-formatter', makeEntry({ id: 99 }));

    // Stays undefined so the next fetch is the source of truth.
    expect(useHistoryStore.getState().entriesByTool['json-formatter']).toBeUndefined();
  });

  it('replaces a row with the same id rather than duplicating', () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 5, output: 'old' })] },
    });

    useHistoryStore
      .getState()
      .addEntry('json-formatter', makeEntry({ id: 5, output: 'new' }));

    const slice = useHistoryStore.getState().entriesByTool['json-formatter'] ?? [];
    expect(slice).toHaveLength(1);
    expect(slice[0]?.output).toBe('new');
  });
});

describe('historyStore.removeEntry', () => {
  it('removes the row optimistically and calls delete IPC', async () => {
    useHistoryStore.setState({
      entriesByTool: {
        'json-formatter': [makeEntry({ id: 1 }), makeEntry({ id: 2 })],
      },
    });
    vi.mocked(mockDeleteEntry).mockResolvedValueOnce(undefined);

    await useHistoryStore.getState().removeEntry('json-formatter', 1);

    expect(mockDeleteEntry).toHaveBeenCalledWith(1);
    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.map((r) => r.id),
    ).toEqual([2]);
  });

  it('rolls back on failure', async () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 1 })] },
    });
    vi.mocked(mockDeleteEntry).mockRejectedValueOnce('disk error');

    await useHistoryStore.getState().removeEntry('json-formatter', 1);

    expect(useHistoryStore.getState().entriesByTool['json-formatter']).toHaveLength(1);
    expect(useAppStore.getState().toast?.type).toBe('error');
  });
});

describe('historyStore.togglePin', () => {
  it('flips pinned in place and calls pin IPC', async () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 1, pinned: false })] },
    });
    vi.mocked(mockPinEntry).mockResolvedValueOnce({ ok: true, reason: null });

    await useHistoryStore.getState().togglePin('json-formatter', 1);

    expect(mockPinEntry).toHaveBeenCalledWith(1, true);
    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.[0]?.pinned,
    ).toBe(true);
  });

  it('shows pin-cap toast and rolls back when ok=false reason=pin_cap', async () => {
    useHistoryStore.setState({
      entriesByTool: { 'json-formatter': [makeEntry({ id: 1, pinned: false })] },
    });
    vi.mocked(mockPinEntry).mockResolvedValueOnce({ ok: false, reason: 'pin_cap' });

    await useHistoryStore.getState().togglePin('json-formatter', 1);

    expect(
      useHistoryStore.getState().entriesByTool['json-formatter']?.[0]?.pinned,
    ).toBe(false);
    expect(useAppStore.getState().toast?.message).toBe('Unpin one to pin another.');
  });

  it('is a no-op when the slice is missing', async () => {
    await useHistoryStore.getState().togglePin('unknown-tool', 1);
    expect(mockPinEntry).not.toHaveBeenCalled();
  });
});

describe('historyStore.getDetailEntry', () => {
  it('returns the entry from the IPC', async () => {
    const entry = makeEntry({ id: 9 });
    vi.mocked(mockGetEntry).mockResolvedValueOnce(entry);

    const result = await useHistoryStore.getState().getDetailEntry(9);

    expect(result).toEqual(entry);
  });

  it('returns null on IPC failure (silent)', async () => {
    vi.mocked(mockGetEntry).mockRejectedValueOnce('decrypt error');

    const result = await useHistoryStore.getState().getDetailEntry(9);

    expect(result).toBeNull();
    expect(useAppStore.getState().toast).toBeNull();
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
