import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface ToolErrorProps {
  error: Error;
  onReset: () => void;
}

const isDev = import.meta.env.DEV;

export function ToolError({ error, onReset }: ToolErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 px-6 py-10 text-center"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <AlertTriangle className="h-8 w-8" style={{ color: 'var(--warning)' }} aria-hidden="true" />
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Something went wrong
      </h2>
      <p className="max-w-md text-sm" style={{ color: 'var(--text-tertiary)' }}>
        This tool crashed unexpectedly. You can reset it to try again, or report a bug if it
        keeps happening.
      </p>
      {isDev && (
        <pre
          className="mono max-w-full overflow-auto rounded px-3 py-2 text-left text-xs"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            maxHeight: '200px',
          }}
        >
          {error.message}
        </pre>
      )}
      <Button variant="primary" onClick={onReset}>
        Try again
      </Button>
    </div>
  );
}
