import { Clock } from 'lucide-react';

interface EmptyStateProps {
  toolName: string;
}

/**
 * Empty state for the history drawer. Shown when the per-tool slice has
 * been fetched and returned zero rows. The copy is intentionally specific
 * to the current tool so the user understands the drawer is per-tool, not
 * global.
 */
export function EmptyState({ toolName }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
      role="status"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--surface-hover)' }}
        aria-hidden="true"
      >
        <Clock className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Recent runs of {toolName} will appear here.
      </p>
    </div>
  );
}
