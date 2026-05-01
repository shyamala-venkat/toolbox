/**
 * Drawer — per-tool "Recent runs" surface mounted by ToolPage.
 *
 * Visual modes (driven by viewport width and user preference):
 *   1. Hidden — viewport < 1024 px. (v1 has no bottom-sheet variant; we
 *      simply omit the drawer for narrow windows. ToolPage's main column
 *      keeps full width.)
 *   2. Rail — viewport 1024–1279 px OR user collapsed. 32 px right edge.
 *   3. Expanded — 300 px wide, list view.
 *   4. Detail — 640 px wide, list compresses to 32 px left rail; right
 *      side renders DetailPanel.
 *
 * The drawer never extends past the viewport. Its height matches the
 * tool's content area (it's a flex sibling, not a fixed/absolute panel).
 *
 * Default expand state: collapsed on first install (Codex C4). The user
 * preference is mirrored into preferences.history.drawerExpanded.
 *
 * Reduced motion: width transitions are dropped when the user has
 * `prefers-reduced-motion: reduce`.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Pause, MoreHorizontal, AlertTriangle } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';
import type { HistoryEntry } from '@/lib/tauri';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { Button } from '@/components/ui/Button';
import { DrawerRail } from './DrawerRail';
import { RowItem } from './RowItem';
import { EmptyState } from './EmptyState';
import { DetailPanel } from './DetailPanel';
import { groupHistoryRows } from './groupByDate';

interface DrawerProps {
  tool: ToolMeta;
  /** The tool's current input, used to gate the "replace?" confirm in
   *  DetailPanel. Optional — when absent we never prompt. */
  currentInput?: string;
}

const RAIL_WIDTH = 32;
const EXPANDED_WIDTH = 300;
const DETAIL_WIDTH = 640;

/** Below this viewport width the drawer is hidden entirely (v1 scope). */
const HIDE_BELOW_PX = 1024;
/** Between this and HIDE_BELOW_PX we force the rail-only state regardless
 *  of the user's saved preference. */
const RAIL_BELOW_PX = 1280;

const useViewportMode = (): 'hidden' | 'auto-rail' | 'normal' => {
  const [mode, setMode] = useState<'hidden' | 'auto-rail' | 'normal'>(() => {
    if (typeof window === 'undefined') return 'normal';
    const w = window.innerWidth;
    if (w < HIDE_BELOW_PX) return 'hidden';
    if (w < RAIL_BELOW_PX) return 'auto-rail';
    return 'normal';
  });
  useEffect(() => {
    const recompute = (): void => {
      const w = window.innerWidth;
      if (w < HIDE_BELOW_PX) setMode('hidden');
      else if (w < RAIL_BELOW_PX) setMode('auto-rail');
      else setMode('normal');
    };
    window.addEventListener('resize', recompute);
    recompute();
    return () => window.removeEventListener('resize', recompute);
  }, []);
  return mode;
};

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
};

export function Drawer({ tool, currentInput }: DrawerProps) {
  const viewportMode = useViewportMode();
  const reducedMotion = usePrefersReducedMotion();
  const navigate = useNavigate();

  const expandedPref = useSettingsStore(
    (s) => s.preferences.history.drawerExpanded,
  );
  const updatePrefs = useSettingsStore((s) => s.update);
  const isHydrated = useSettingsStore((s) => s.isHydrated);

  const paused = useHistoryStore((s) => s.paused);
  const entries = useHistoryStore((s) => s.entriesByTool[tool.id]);
  const fetchError = useHistoryStore((s) => s.errorByTool[tool.id] ?? null);
  const fetchEntries = useHistoryStore((s) => s.fetchEntries);
  const retryFetch = useHistoryStore((s) => s.retryFetch);
  const togglePin = useHistoryStore((s) => s.togglePin);
  const removeEntry = useHistoryStore((s) => s.removeEntry);

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  // Effective expand state: rail when forced by viewport, otherwise the
  // user's preference. We never persist the auto-rail flip.
  const isExpanded = viewportMode === 'normal' && expandedPref;

  const setExpanded = (next: boolean): void => {
    updatePrefs({
      history: { ...useSettingsStore.getState().preferences.history, drawerExpanded: next },
    });
    if (!next) setSelectedEntry(null);
  };

  // Cmd/Ctrl + Shift + H toggles the drawer.
  useKeyboardShortcut('mod+shift+h', () => {
    if (viewportMode === 'hidden') return;
    setExpanded(!isExpanded);
  });

  // Hydrate the per-tool entries when the drawer first becomes visible
  // (expanded, or rail with unread badge). We fetch lazily so the cold
  // start of every tool isn't dragged down by an IPC. If a previous fetch
  // failed (errorByTool is set) we DON'T auto-retry — the user explicitly
  // clicks [Retry] in the unavailable banner.
  useEffect(() => {
    if (!isHydrated) return;
    if (viewportMode === 'hidden') return;
    if (entries !== undefined) return;
    if (fetchError) return;
    void fetchEntries(tool.id);
  }, [isHydrated, viewportMode, entries, fetchError, fetchEntries, tool.id]);

  // Esc closes the detail panel; second Esc collapses the drawer.
  useEffect(() => {
    const handle = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (selectedEntry) {
        setSelectedEntry(null);
      } else if (isExpanded) {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry, isExpanded]);

  const groups = useMemo(
    () => (entries ? groupHistoryRows(entries) : []),
    [entries],
  );

  if (viewportMode === 'hidden') return null;

  const width = selectedEntry
    ? DETAIL_WIDTH
    : isExpanded
      ? EXPANDED_WIDTH
      : RAIL_WIDTH;

  const transitionStyle = reducedMotion
    ? undefined
    : 'width 200ms cubic-bezier(0.2, 0, 0, 1)';

  // ─── Rail-only render (collapsed) ───────────────────────────────────────
  if (!isExpanded && !selectedEntry) {
    const count = entries?.length ?? 0;
    return (
      <aside
        aria-label={`Recent runs for ${tool.name}`}
        className="shrink-0"
        style={{
          width,
          transition: transitionStyle,
        }}
      >
        <DrawerRail
          count={count}
          hasUnread={false}
          paused={paused}
          unavailable={Boolean(fetchError)}
          onExpand={() => setExpanded(true)}
        />
      </aside>
    );
  }

  // ─── Expanded / detail render ───────────────────────────────────────────
  return (
    <aside
      aria-label={`Recent runs for ${tool.name}`}
      className="flex shrink-0 flex-col"
      style={{
        width,
        transition: transitionStyle,
        backgroundColor: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-primary)',
      }}
    >
      <div className="flex h-full">
        {/* List column. When detail is open this compresses to a 32 px rail
            with just a chevron back. */}
        {selectedEntry ? (
          <button
            type="button"
            onClick={() => setSelectedEntry(null)}
            aria-label="Back to list"
            className="flex h-full shrink-0 cursor-pointer flex-col items-center justify-start py-3 transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
            style={{
              width: RAIL_WIDTH,
              borderRight: '1px solid var(--border-primary)',
              color: 'var(--text-tertiary)',
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col">
            {/* Header */}
            <div
              className="flex shrink-0 items-center gap-2 px-3 py-2.5"
              style={{ borderBottom: '1px solid var(--border-primary)' }}
            >
              <Clock
                className="h-3.5 w-3.5"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Recent runs
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {entries?.length ?? 0}
              </span>
              {paused ? (
                <span
                  className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color: 'var(--warning)',
                    backgroundColor: 'var(--warning-subtle)',
                  }}
                  title="History capture is paused"
                >
                  <Pause className="h-2.5 w-2.5" aria-hidden="true" />
                  Paused
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                <a
                  href="/settings"
                  aria-label="Open history settings"
                  className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={(e) => {
                    // BrowserRouter — `useNavigate` is the only way to
                    // trigger a route change without a full reload. The
                    // anchor's `href` is preserved so middle-click and
                    // cmd-click open in a new tab as expected.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate('/settings');
                  }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Collapse drawer"
                  className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {fetchError ? (
                <UnavailableState
                  message={fetchError}
                  onRetry={() => void retryFetch(tool.id)}
                />
              ) : entries == null ? (
                <DrawerSkeleton />
              ) : entries.length === 0 ? (
                <EmptyState toolName={tool.name} />
              ) : (
                groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h3
                      className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {group.label}
                    </h3>
                    {group.rows.map((row) => (
                      <RowItem
                        key={row.id}
                        entry={row}
                        selected={false}
                        onSelect={() => setSelectedEntry(row)}
                        onTogglePin={() => void togglePin(tool.id, row.id)}
                        onDelete={() => void removeEntry(tool.id, row.id)}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          </div>
        )}

        {/* Detail column */}
        {selectedEntry ? (
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <DetailPanel
              tool={tool}
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
              currentInput={currentInput}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 w-full rounded"
          style={{ backgroundColor: 'var(--surface-hover)', opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

interface UnavailableStateProps {
  message: string;
  onRetry: () => void;
}

/**
 * Disabled-rail body shown when `fetchEntries` failed (keychain locked, IPC
 * down, etc.). Per the plan's "DB error / corrupt" interaction state, this
 * should be compact: a friendly headline, a [Retry] action, and a small
 * diagnostic line so power users can self-serve without filing an issue.
 */
function UnavailableState({ message, onRetry }: UnavailableStateProps) {
  // Truncate the diagnostic so a noisy stack trace doesn't blow out the
  // narrow drawer column. The full string is still in the title attribute.
  const trimmed = message.length > 120 ? `${message.slice(0, 117)}…` : message;
  return (
    <div
      className="flex flex-col items-start gap-2 px-3 py-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--warning)' }}
          aria-hidden="true"
        />
        <span
          className="text-xs font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          History temporarily unavailable
        </span>
      </div>
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        Your tool still works normally — only the recent-runs list is offline.
      </p>
      <Button size="sm" variant="ghost" onClick={onRetry}>
        Retry
      </Button>
      <span
        className="mono truncate text-[10px]"
        style={{ color: 'var(--text-tertiary)', maxWidth: '100%' }}
        title={message}
      >
        {trimmed}
      </span>
    </div>
  );
}
