import { Loader2, AlertCircle } from 'lucide-react';
import { CopyButton } from '@/components/ui/CopyButton';

export type HashRowState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; digest: string }
  | { kind: 'error'; message: string };

export interface HashResultRowProps {
  label: string;
  state: HashRowState;
}

export function HashResultRow({ label, state }: HashResultRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={{
        borderTop: '1px solid var(--border-secondary)',
      }}
    >
      <div
        className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </div>

      <div className="min-w-0 flex-1">
        {state.kind === 'idle' && (
          <span className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
            Awaiting input
          </span>
        )}
        {state.kind === 'loading' && (
          <span
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Loader2 className="h-3.5 w-3.5 tb-anim-spin" aria-hidden="true" />
            Computing…
          </span>
        )}
        {state.kind === 'ok' && (
          <code
            className="mono block truncate text-xs"
            style={{ color: 'var(--text-primary)' }}
            title={state.digest}
          >
            {state.digest}
          </code>
        )}
        {state.kind === 'error' && (
          <span
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--danger)' }}
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {state.message}
          </span>
        )}
      </div>

      <div className="shrink-0">
        <CopyButton
          value={state.kind === 'ok' ? state.digest : ''}
          disabled={state.kind !== 'ok'}
          variant="ghost"
          size="sm"
          label=""
          successLabel=""
        />
      </div>
    </div>
  );
}
