import { Clock, ChevronLeft } from 'lucide-react';

interface DrawerRailProps {
  /** Number of rows currently loaded for this tool. Drives the badge. */
  count: number;
  /** Whether the user has new (unread) rows since their last expand. */
  hasUnread: boolean;
  /** Whether history capture is paused globally. Renders a small dot. */
  paused: boolean;
  /** Whether the most recent fetch failed (keychain locked, IPC error,
   *  etc.). When true the rail surfaces an amber dot so the user knows
   *  to expand and retry. */
  unavailable?: boolean;
  onExpand: () => void;
}

/**
 * 56 px right-edge rail. Click anywhere on the rail to expand into the
 * full drawer.
 *
 * Visual goals:
 *   - Looks like a panel pinned to the edge, not a scrollbar artifact.
 *     A 32 px rail with rotated text reads as "scrollbar" to most users
 *     and tested poorly in real-world feedback.
 *   - Click target is the whole rail. Clear hover state. The chevron at
 *     top is decorative, not the primary affordance.
 *   - Count badge below the icon is human-readable, not rotated.
 *   - Status dots (unread / paused / unavailable) live at the bottom.
 */
export function DrawerRail({
  count,
  hasUnread,
  paused,
  unavailable,
  onExpand,
}: DrawerRailProps) {
  const RAIL_WIDTH = 56;
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand recent runs (${count} ${count === 1 ? 'entry' : 'entries'})`}
      aria-expanded={false}
      title="Recent runs · click to expand"
      className="group relative flex h-full shrink-0 cursor-pointer flex-col items-center justify-between gap-2 py-3 transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2"
      style={{
        width: RAIL_WIDTH,
        backgroundColor: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-primary)',
      }}
    >
      {/* Top: chevron-left hint that this expands. Subtle, decorative.
          Hover state lights it up so the affordance is unmistakable. */}
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors group-hover:bg-[var(--surface-2)]"
        style={{ color: 'var(--text-tertiary)' }}
        aria-hidden="true"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>

      {/* Middle: stack a clock icon above the count. Both upright (no
          rotated text). This is the primary "this is the history rail"
          affordance. */}
      <span className="flex flex-col items-center gap-1.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors group-hover:bg-[var(--surface-2)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-hidden="true"
        >
          <Clock className="h-4 w-4" />
        </span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{
            color: 'var(--text-primary)',
            backgroundColor: 'var(--surface-2)',
          }}
          aria-hidden="true"
        >
          {count}
        </span>
      </span>

      {/* Bottom: status dot. Order: unavailable > unread > paused > nothing. */}
      <span className="flex h-3 w-3 items-center justify-center" aria-hidden="true">
        {unavailable ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--warning, #f59e0b)' }}
            title="History temporarily unavailable"
          />
        ) : hasUnread ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
            title="New runs since last view"
          />
        ) : paused ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--warning, #f59e0b)' }}
            title="History paused"
          />
        ) : null}
      </span>
    </button>
  );
}
