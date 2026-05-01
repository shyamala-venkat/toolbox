import { Clock, ChevronLeft } from 'lucide-react';

interface DrawerRailProps {
  /** Number of rows currently loaded for this tool. Drives the badge. */
  count: number;
  /** Whether the user has new (unread) rows since their last expand. */
  hasUnread: boolean;
  /** Whether history capture is paused globally. Renders a small dot. */
  paused: boolean;
  /** Whether the most recent fetch failed (keychain locked, IPC error,
   *  etc.). When true the rail surfaces an amber dot + "History off" so
   *  the user can self-serve from the collapsed view. Tooltip mirrors the
   *  plan's interaction-states spec. */
  unavailable?: boolean;
  onExpand: () => void;
}

/**
 * 32 px right-edge rail. Click anywhere on the rail to expand into the
 * full drawer. Shows a vertical "Recent · N" affordance and an unread dot
 * when new rows have arrived since the last expand.
 *
 * Accessibility: the entire rail is a button so keyboard users can tab to
 * it and press Enter/Space. The vertical text uses CSS writing-mode so
 * screen readers still read it left-to-right.
 */
export function DrawerRail({ count, hasUnread, paused, onExpand }: DrawerRailProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand recent runs (${count} ${count === 1 ? 'entry' : 'entries'})`}
      aria-expanded={false}
      className="group relative flex h-full shrink-0 cursor-pointer flex-col items-center justify-between py-3 transition-colors focus:outline-none focus-visible:ring-2"
      style={{
        width: 32,
        backgroundColor: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-primary)',
      }}
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        aria-hidden="true"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>

      <span
        className="flex flex-1 items-center justify-center gap-1.5"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          color: 'var(--text-tertiary)',
        }}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">
          Recent
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          · {count}
        </span>
      </span>

      <div className="flex h-3 items-center justify-center">
        {hasUnread ? (
          <span
            aria-label="Unread runs"
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        ) : paused ? (
          <span
            aria-label="History paused"
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--warning)' }}
          />
        ) : null}
      </div>
    </button>
  );
}
