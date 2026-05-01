/**
 * DetailPanel — slide-in detail view for a selected history row.
 *
 * Owns:
 *   - Loading the full entry (input + output) via `historyStore.getDetailEntry`
 *   - Rendering the metadata strip (timestamp, sizes, params)
 *   - Two-column INPUT | OUTPUT body via <HistoryViewer> (stacks on narrow)
 *   - Tombstone branch: shows the explanatory copy with no Restore button
 *   - Action row: Restore, Copy input/output, Pin/Unpin, Delete
 *   - Keyboard model: Esc closes (and the parent handles the second-Esc
 *     to focus the tool input); R restores; P pins; Delete deletes (with
 *     confirm)
 *
 * The panel does NOT own the slide animation — that's the parent Drawer's
 * job (animating its own width). The panel just renders into whatever
 * width it was given.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, Trash2, X, RotateCcw, Lock } from 'lucide-react';
import type { HistoryEntry } from '@/lib/tauri';
import type { ToolMeta } from '@/tools/types';
import { useHistoryStore } from '@/stores/historyStore';
import { useHistoryRestore } from '@/contexts/HistoryRestoreContext';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { HistoryViewer } from './HistoryViewer';

interface DetailPanelProps {
  tool: ToolMeta;
  entry: HistoryEntry;
  /** Provided by the Drawer; closes the panel and returns the list to its
   *  expanded view. */
  onClose: () => void;
  /** When the tool's current input differs from the stored input, the
   *  parent surface (the consuming tool) may want to confirm before
   *  overwriting. We delegate to the parent via this hook so the dialog
   *  experience is consistent across tools — null means no confirm needed. */
  currentInput?: string;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const renderParamsLine = (params: unknown): string | null => {
  if (params === null || typeof params !== 'object') return null;
  const entries = Object.entries(params as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => {
      if (typeof value === 'boolean') return `${key}: ${value ? 'on' : 'off'}`;
      if (typeof value === 'number' || typeof value === 'string') {
        return `${key}: ${String(value)}`;
      }
      return `${key}: …`;
    })
    .join(' · ');
};

export function DetailPanel({ tool, entry, onClose, currentInput = '' }: DetailPanelProps) {
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const togglePin = useHistoryStore((s) => s.togglePin);
  const getDetailEntry = useHistoryStore((s) => s.getDetailEntry);
  const { requestRestore } = useHistoryRestore();
  const showToast = useAppStore((s) => s.showToast);

  // Load full content. The list IPC may return previews truncated to 1KB;
  // get_history_entry returns the unredacted full row.
  const [full, setFull] = useState<HistoryEntry>(entry);
  const [loadingFull, setLoadingFull] = useState<boolean>(!entry.redacted);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [confirmRestore, setConfirmRestore] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (entry.redacted) {
      setFull(entry);
      setLoadingFull(false);
      return;
    }
    setLoadingFull(true);
    void getDetailEntry(entry.id).then((row) => {
      if (cancelled) return;
      setFull(row ?? entry);
      setLoadingFull(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entry, getDetailEntry]);

  // Reset transient confirmations when the row changes.
  useEffect(() => {
    setConfirmDelete(false);
    setConfirmRestore(false);
  }, [entry.id]);

  // Keyboard model: Esc closes; R restores (when not tombstone); P toggles
  // pin; Cmd/Ctrl+Delete (or Backspace) deletes. The R and P shortcuts MUST
  // be guarded against modifier combinations — without those guards we'd
  // hijack browser refresh (Cmd+R) and print (Cmd+P) any time the detail
  // panel is mounted. This was C2 in the code review.
  useEffect(() => {
    const handle = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      // Don't hijack typing inside an input/textarea.
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (
        (e.key === 'r' || e.key === 'R') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !full.redacted
      ) {
        e.preventDefault();
        handleRestoreClick();
      } else if (
        (e.key === 'p' || e.key === 'P') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (full.redacted) return;
        e.preventDefault();
        void togglePin(tool.id, full.id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          setConfirmDelete(true);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
    // L2: include `currentInput` so the Restore handler reads the latest
    // editor contents — otherwise pressing R after the user typed would
    // diff against the stale snapshot taken at panel mount and either skip
    // the confirm prompt or show the wrong one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, tool.id, onClose, currentInput]);

  const paramsLine = useMemo(() => renderParamsLine(full.params), [full.params]);

  const handleRestoreClick = (): void => {
    if (full.redacted || full.input == null) return;
    const trimmedCurrent = currentInput.trim();
    if (trimmedCurrent.length > 0 && trimmedCurrent !== full.input.trim()) {
      setConfirmRestore(true);
      return;
    }
    applyRestore();
  };

  const applyRestore = (): void => {
    if (full.input == null) return;
    requestRestore({ input: full.input, params: full.params });
    setConfirmRestore(false);
    showToast('Restored to editor', 'success');
    onClose();
  };

  const handleDelete = async (): Promise<void> => {
    await removeEntry(tool.id, full.id);
    onClose();
  };

  return (
    <div
      className="flex h-full flex-col"
      role="dialog"
      aria-label={`History entry from ${formatTimestamp(full.timestamp)}`}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <div className="flex flex-col">
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatTimestamp(full.timestamp)}
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {full.redacted ? 'Sensitive — content not stored' : tool.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {full.redacted ? (
          <TombstoneBody entry={full} />
        ) : (
          <>
            {/* Metadata strip */}
            <div
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>
                input {formatBytes((full.input ?? '').length)}
              </span>
              <span aria-hidden="true">·</span>
              <span>output {formatBytes((full.output ?? '').length)}</span>
              {paramsLine ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="mono">{paramsLine}</span>
                </>
              ) : null}
            </div>

            {loadingFull ? (
              <div
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
                role="status"
              >
                Loading…
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <section>
                  <h3
                    className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Input
                  </h3>
                  <HistoryViewer
                    content={full.input ?? ''}
                    kind={tool.historyKind ?? 'text'}
                    label={`Stored input from ${formatTimestamp(full.timestamp)}`}
                  />
                </section>
                <section>
                  <h3
                    className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Output
                  </h3>
                  <HistoryViewer
                    content={full.output ?? ''}
                    kind={tool.historyKind ?? 'text'}
                    label={`Stored output from ${formatTimestamp(full.timestamp)}`}
                  />
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-3"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        {!full.redacted ? (
          <>
            {confirmRestore ? (
              <>
                <span
                  className="mr-auto text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Replace current input?
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRestore(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={applyRestore}>
                  Replace
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  leadingIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
                  onClick={handleRestoreClick}
                  disabled={full.input == null}
                >
                  Restore to editor
                </Button>
                <CopyButton
                  value={full.input ?? ''}
                  label="Copy input"
                  successLabel="Copied input"
                />
                <CopyButton
                  value={full.output ?? ''}
                  label="Copy output"
                  successLabel="Copied output"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  leadingIcon={
                    full.pinned ? (
                      <PinOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Pin className="h-4 w-4" aria-hidden="true" />
                    )
                  }
                  onClick={() => void togglePin(tool.id, full.id)}
                >
                  {full.pinned ? 'Unpin' : 'Pin'}
                </Button>
              </>
            )}
          </>
        ) : null}

        <div className={confirmRestore ? '' : 'ml-auto'}>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                Delete this entry?
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={() => void handleDelete()}>
                Delete
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Display labels for each pattern id emitted by Rust. The keys here MUST
 * match the `PATTERN_IDS` array in `src-tauri/src/security/redaction.rs`
 * exactly — the previous implementation slugified the id before lookup
 * ("aws access key" instead of "aws_access_key") so every branch was dead.
 * If a new pattern is added on the Rust side without a label here, the
 * tombstone copy falls back to a humanized form of the raw id.
 */
const PATTERN_LABELS: Record<string, string> = {
  aws_access_key: 'an AWS access key',
  github_pat: 'a GitHub personal access token',
  github_fine_grained_pat: 'a GitHub fine-grained personal access token',
  stripe_live_key: 'a Stripe live API key',
  stripe_restricted_key: 'a Stripe restricted API key',
  slack_token: 'a Slack token',
  google_api_key: 'a Google API key',
  bearer_token: 'a Bearer token',
  generic_sk_key: 'an API key',
  pem_private_key: 'a private key',
  jwt: 'a JWT',
};

function TombstoneBody({ entry }: { entry: HistoryEntry }) {
  const reason = entry.reason ?? '';
  const familyDescription = (() => {
    if (reason.startsWith('sensitive_pattern') || reason.startsWith('output_pattern')) {
      const colon = reason.indexOf(':');
      const rawId = colon === -1 ? '' : reason.slice(colon + 1);
      const label =
        PATTERN_LABELS[rawId] ?? (rawId.length > 0 ? rawId.replace(/[_-]/g, ' ') : '');
      const subject = reason.startsWith('output_pattern') ? 'output' : 'input';
      return label.length > 0
        ? `This ${subject} matched a pattern that looks like ${label}.`
        : `This ${subject} matched a known secret pattern.`;
    }
    if (reason === 'blocklisted') {
      return 'This tool never stores history. Its content is too sensitive by design.';
    }
    return 'This run was excluded from history as a privacy precaution.';
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lock
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
          aria-hidden="true"
        />
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Sensitive content was not stored.
        </span>
      </div>
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {familyDescription} As a privacy precaution, the input and output
        were not saved.
      </p>
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-tertiary)' }}
      >
        You can adjust this behavior in Settings → History.
      </p>
    </div>
  );
}
