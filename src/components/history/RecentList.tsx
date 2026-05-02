/**
 * RecentList — the inline content for the "Recent" tab. Renders all rows
 * grouped by date (Pinned · Today · Yesterday · …) with accordion expand
 * for each row.
 *
 * Click a row to expand it inline; the row's input/output and per-entry
 * actions render below the row. Click again to collapse. Click another
 * row to swap. Restore action calls back to the parent so the parent can
 * apply the restore AND switch tabs back to Editor.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight as ChevronRightIcon, Copy, RotateCcw, Trash2, Pin, PinOff, AlertTriangle, Lock } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';
import type { HistoryEntry } from '@/lib/tauri';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { groupHistoryRows } from './groupByDate';
import { EmptyState } from './EmptyState';
import { HistoryViewer } from './HistoryViewer';

interface RecentListProps {
  tool: ToolMeta;
  /** Tool's current input — used to confirm before overwriting on
   *  Restore. Optional; absent = never confirm. */
  currentInput?: string;
  /** Called when the user clicks "Restore to editor" on an expanded row.
   *  The parent (EditorHistoryTabs) is responsible for switching back to
   *  the Editor tab AND dispatching the restore via HistoryRestoreContext. */
  onRestore: (input: string, params: unknown) => void;
}

export function RecentList({ tool, currentInput, onRestore }: RecentListProps) {
  const isHydrated = useSettingsStore((s) => s.isHydrated);
  const entries = useHistoryStore((s) => s.entriesByTool[tool.id]);
  const fetchError = useHistoryStore((s) => s.errorByTool[tool.id] ?? null);
  const fetchEntries = useHistoryStore((s) => s.fetchEntries);
  const retryFetch = useHistoryStore((s) => s.retryFetch);
  const togglePin = useHistoryStore((s) => s.togglePin);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const getDetailEntry = useHistoryStore((s) => s.getDetailEntry);

  const showToast = useAppStore((s) => s.showToast);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HistoryEntry | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  // Lazy fetch on mount.
  useEffect(() => {
    if (!isHydrated) return;
    if (entries !== undefined) return;
    if (fetchError) return;
    void fetchEntries(tool.id);
  }, [isHydrated, entries, fetchError, fetchEntries, tool.id]);

  // When the user expands a row, fetch its full content (list returns
  // truncated previews server-side). Reset detail + confirm state on
  // expand-different-row.
  useEffect(() => {
    setConfirmReplace(false);
    if (expandedId == null) {
      setDetail(null);
      return;
    }
    void (async () => {
      const full = await getDetailEntry(expandedId);
      setDetail(full);
    })();
  }, [expandedId, getDetailEntry]);

  const groups = useMemo(
    () => (entries ? groupHistoryRows(entries) : []),
    [entries],
  );

  // ── Loading / error / empty branches ─────────────────────────────────

  if (fetchError) {
    return (
      <div
        className="rounded-md p-6"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border-primary)' }}
      >
        <div className="flex flex-col items-center text-center">
          <AlertTriangle
            className="h-6 w-6"
            style={{ color: 'var(--warning, #f59e0b)' }}
            aria-hidden="true"
          />
          <p
            className="mt-3 text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            History temporarily unavailable
          </p>
          <p
            className="mt-1 max-w-md text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            The history database couldn’t be read this session. The most
            common cause is denying the macOS keychain access prompt. The
            error reported by the backend is below — open Settings → History
            for guidance, or click Retry to try again.
          </p>
          <pre
            className="mt-3 max-w-full overflow-auto rounded px-3 py-2 text-left text-[11px]"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--surface-2, var(--surface-hover))',
              border: '1px solid var(--border-hairline)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {fetchError}
          </pre>
          <button
            type="button"
            onClick={() => void retryFetch(tool.id)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
            style={{
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              backgroundColor: 'var(--surface-1)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (entries == null) {
    return <SkeletonList />;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md" style={{ border: '1px solid var(--border-primary)' }}>
        <EmptyState toolName={tool.name} />
      </div>
    );
  }

  // ── Real list ────────────────────────────────────────────────────────

  const handleRestoreClick = (full: HistoryEntry): void => {
    if (full.input == null) return; // tombstone — no restore
    if (currentInput && currentInput.length > 0 && currentInput !== full.input) {
      setConfirmReplace(true);
      return;
    }
    onRestore(full.input, full.params);
  };

  const handleConfirmReplace = (full: HistoryEntry): void => {
    if (full.input == null) return;
    onRestore(full.input, full.params);
    setConfirmReplace(false);
  };

  const handleCopy = async (text: string | null, kind: 'input' | 'output'): Promise<void> => {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${kind}`, 'success');
    } catch {
      showToast(`Could not copy ${kind}`, 'error');
    }
  };

  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ border: '1px solid var(--border-primary)' }}
    >
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3
            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest"
            style={{
              color: 'var(--text-tertiary)',
              backgroundColor: 'var(--surface-1)',
              borderBottom: '1px solid var(--border-hairline)',
            }}
          >
            {group.label}
          </h3>
          {group.rows.map((row) => {
            const isExpanded = expandedId === row.id;
            const isTombstone = row.redacted;
            return (
              <div key={row.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                <RowSummary
                  entry={row}
                  expanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : row.id)}
                  onTogglePin={() => void togglePin(tool.id, row.id)}
                  onDelete={() => {
                    void removeEntry(tool.id, row.id);
                    if (isExpanded) setExpandedId(null);
                  }}
                />
                {isExpanded ? (
                  <RowExpanded
                    tool={tool}
                    row={row}
                    detail={detail}
                    isTombstone={isTombstone}
                    confirmReplace={confirmReplace}
                    onCancelReplace={() => setConfirmReplace(false)}
                    onConfirmReplace={() =>
                      detail ? handleConfirmReplace(detail) : undefined
                    }
                    onRestore={() => (detail ? handleRestoreClick(detail) : undefined)}
                    onCopyInput={() => void handleCopy(detail?.input ?? null, 'input')}
                    onCopyOutput={() => void handleCopy(detail?.output ?? null, 'output')}
                  />
                ) : null}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ─── Row summary (collapsed view) ────────────────────────────────────────

interface RowSummaryProps {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

const PREVIEW_MAX = 100;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const buildPreview = (raw: string | null): string => {
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_MAX) return flat;
  return `${flat.slice(0, PREVIEW_MAX - 1)}…`;
};

const tombstoneText = (reason: string | null): string => {
  if (!reason) return 'Sensitive — not stored';
  if (reason.startsWith('output_pattern')) return 'Sensitive output — not stored';
  return 'Sensitive — not stored';
};

function RowSummary({ entry, expanded, onToggle, onTogglePin, onDelete }: RowSummaryProps) {
  const isTombstone = entry.redacted;
  const stop = (fn: () => void) =>
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      fn();
    };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={
        isTombstone
          ? `${formatTime(entry.timestamp)} sensitive content was not stored, click to expand`
          : `${formatTime(entry.timestamp)} ${buildPreview(entry.input ?? entry.output ?? '')}, click to expand`
      }
      className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: expanded ? 'var(--surface-1)' : 'transparent',
      }}
    >
      <span
        className="shrink-0 transition-transform"
        style={{
          color: 'var(--text-tertiary)',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}
        aria-hidden="true"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </span>

      {isTombstone ? (
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--surface-2)' }}
          aria-hidden="true"
        >
          <Lock className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
        </span>
      ) : null}

      <span
        className="shrink-0 text-[11px] font-medium tabular-nums"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {formatTime(entry.timestamp)}
      </span>

      {entry.pinned && !isTombstone ? (
        <Pin
          className="h-3 w-3 shrink-0"
          style={{ color: 'var(--accent)' }}
          aria-label="Pinned"
        />
      ) : null}

      <span
        className="mono min-w-0 flex-1 truncate text-xs"
        style={{
          color: isTombstone ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {isTombstone
          ? tombstoneText(entry.reason)
          : buildPreview(entry.input ?? entry.output ?? '') || '(empty)'}
      </span>

      {!isTombstone ? (
        <span
          className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden={false}
        >
          <button
            type="button"
            onClick={stop(onTogglePin)}
            aria-label={entry.pinned ? 'Unpin' : 'Pin'}
            className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {entry.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={stop(onDelete)}
            aria-label="Delete"
            className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}
    </button>
  );
}

// ─── Row expanded panel ──────────────────────────────────────────────────

interface RowExpandedProps {
  tool: ToolMeta;
  row: HistoryEntry;
  /** The fully-fetched detail (with full input/output, not preview-trunc).
   *  Null while still loading. */
  detail: HistoryEntry | null;
  isTombstone: boolean;
  confirmReplace: boolean;
  onCancelReplace: () => void;
  onConfirmReplace: () => void;
  onRestore: () => void;
  onCopyInput: () => void;
  onCopyOutput: () => void;
}

function RowExpanded({
  tool,
  row,
  detail,
  isTombstone,
  confirmReplace,
  onCancelReplace,
  onConfirmReplace,
  onRestore,
  onCopyInput,
  onCopyOutput,
}: RowExpandedProps) {
  if (isTombstone) {
    return (
      <div
        className="px-3 py-4 text-sm"
        style={{
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--surface-1)',
          borderTop: '1px solid var(--border-hairline)',
        }}
      >
        <div className="flex items-start gap-3">
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p style={{ color: 'var(--text-primary)' }}>
              The input or output for this run looked like sensitive content
              — an API key, password, or other credential — so we did not
              store it.
            </p>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              You can disable this protection in Settings → History, but we
              recommend leaving it on.
            </p>
            {row.reason ? (
              <p
                className="mt-2 font-mono text-[11px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                pattern: {row.reason}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (detail == null || detail.id !== row.id) {
    return (
      <div
        className="flex items-center justify-center px-3 py-6 text-xs"
        style={{
          color: 'var(--text-tertiary)',
          backgroundColor: 'var(--surface-1)',
          borderTop: '1px solid var(--border-hairline)',
        }}
      >
        Loading…
      </div>
    );
  }

  const kind = tool.historyKind ?? 'text';

  return (
    <div
      className="px-3 py-3"
      style={{
        backgroundColor: 'var(--surface-1)',
        borderTop: '1px solid var(--border-hairline)',
      }}
    >
      {/* Input */}
      <PaneHeader label="INPUT" onCopy={onCopyInput} />
      <div className="mt-1 mb-3 max-h-[200px] overflow-auto rounded-md" style={{ border: '1px solid var(--border-hairline)' }}>
        <HistoryViewer kind={kind} content={detail.input ?? ''} label="Input" />
      </div>

      {/* Output */}
      <PaneHeader label="OUTPUT" onCopy={onCopyOutput} />
      <div className="mt-1 mb-3 max-h-[200px] overflow-auto rounded-md" style={{ border: '1px solid var(--border-hairline)' }}>
        <HistoryViewer kind={kind} content={detail.output ?? ''} label="Output" />
      </div>

      {/* Action row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirmReplace ? (
          <>
            <span
              className="text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              Replace your current input with this run?
            </span>
            <button
              type="button"
              onClick={onConfirmReplace}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
              style={{
                color: 'white',
                backgroundColor: 'var(--accent)',
              }}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onCancelReplace}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
              style={{
                color: 'white',
                backgroundColor: 'var(--accent)',
              }}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Restore to editor
            </button>
            <button
              type="button"
              onClick={onCopyInput}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy input
            </button>
            <button
              type="button"
              onClick={onCopyOutput}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy output
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface PaneHeaderProps {
  label: string;
  onCopy: () => void;
}

function PaneHeader({ label, onCopy }: PaneHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ border: '1px solid var(--border-primary)' }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2.5"
          style={{
            borderBottom: '1px solid var(--border-hairline)',
          }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          />
          <span
            className="inline-block h-3 w-12 rounded"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          />
          <span
            className="inline-block h-3 flex-1 rounded"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          />
        </div>
      ))}
    </div>
  );
}

// Avoid unused-import warning if I drop one of the icons during tweaks.
void ChevronRightIcon;
