import { Lock, Pin, PinOff, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '@/lib/tauri';
import { cn } from '@/lib/utils';

interface RowItemProps {
  entry: HistoryEntry;
  selected: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

const PREVIEW_MAX_CHARS = 80;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildPreview = (raw: string | null): string => {
  if (!raw) return '';
  // Collapse control whitespace into single spaces so a JSON blob renders
  // as a single legible line. The detail panel restores formatting.
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_MAX_CHARS) return flat;
  return `${flat.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
};

const tombstoneCopy = (reason: string | null): string => {
  if (!reason) return 'Sensitive — not stored';
  if (reason === 'blocklisted') return 'Sensitive — not stored';
  if (reason.startsWith('sensitive_pattern')) return 'Sensitive — not stored';
  if (reason.startsWith('output_pattern')) return 'Sensitive output — not stored';
  return 'Sensitive — not stored';
};

const tombstoneDetail = (reason: string | null): string | null => {
  if (!reason) return null;
  const colonIdx = reason.indexOf(':');
  if (colonIdx === -1) return null;
  // `sensitive_pattern:aws_access_key` → "matched: aws access key"
  const id = reason.slice(colonIdx + 1).replace(/[_-]/g, ' ');
  return id.length > 0 ? `matched: ${id}` : null;
};

/**
 * Row in the history drawer. Two visual variants:
 *   - Normal: timestamp + 1-line preview (mono, truncated)
 *   - Tombstone (`redacted=true`): lock icon + "Sensitive — not stored"
 *     plus a small reason line. No actions possible — pin/trash are still
 *     hidden because tombstones cannot be pinned and deletion happens via
 *     the detail panel only (matches the plan's spec).
 */
export function RowItem({
  entry,
  selected,
  onSelect,
  onTogglePin,
  onDelete,
}: RowItemProps) {
  const isTombstone = entry.redacted;
  const time = formatTime(entry.timestamp);
  const preview = buildPreview(entry.input ?? entry.output ?? '');

  const handleClick = (): void => onSelect();

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const stopAndRun = (fn: () => void) =>
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      fn();
    };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        isTombstone
          ? `${time} — sensitive content was not stored`
          : `${time} — ${preview || 'history entry'}`
      }
      // `aria-pressed` is for toggle buttons (true/false/mixed); using it
      // here would have screen readers announce "pressed/not pressed" for a
      // row that just opens a detail view. `aria-current` is the right
      // semantic for "this is the row currently displayed in the panel".
      // (Restructuring to role="option" inside a role="listbox" is the more
      // idiomatic pattern but invasive — deferring to a future PR.)
      {...(selected ? { 'aria-current': 'true' as const } : {})}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors',
        'focus:outline-none focus-visible:ring-2',
      )}
      style={{
        minHeight: 56,
        borderBottom: '1px solid var(--border-hairline)',
        backgroundColor: selected ? 'var(--accent-subtle)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
      }}
    >
      {isTombstone ? (
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--surface-hover)' }}
          aria-hidden="true"
        >
          <Lock
            className="h-3 w-3"
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 text-[11px] font-medium tabular-nums"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {time}
          </span>
          {entry.pinned && !isTombstone ? (
            <Pin
              className="h-3 w-3"
              style={{ color: 'var(--accent)' }}
              aria-label="Pinned"
            />
          ) : null}
        </div>
        {isTombstone ? (
          <>
            <span
              className="truncate text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {tombstoneCopy(entry.reason)}
            </span>
            {tombstoneDetail(entry.reason) ? (
              <span
                className="truncate text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {tombstoneDetail(entry.reason)}
              </span>
            ) : null}
          </>
        ) : (
          <span
            className="mono truncate text-xs"
            style={{ color: 'var(--text-primary)' }}
            title={preview}
          >
            {preview || (
              <span style={{ color: 'var(--text-tertiary)' }}>(empty)</span>
            )}
          </span>
        )}
      </div>

      {!isTombstone ? (
        <div
          className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden={false}
        >
          <button
            type="button"
            onClick={stopAndRun(onTogglePin)}
            aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
            className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)] focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {entry.pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={stopAndRun(onDelete)}
            aria-label="Delete entry"
            className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)] focus:outline-none focus-visible:ring-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
