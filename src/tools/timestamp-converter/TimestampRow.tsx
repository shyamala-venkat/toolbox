import { CopyButton } from '@/components/ui/CopyButton';

export interface TimestampRowProps {
  label: string;
  value: string;
  hint?: string;
}

export function TimestampRow({ label, value, hint }: TimestampRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5"
      style={{
        borderTop: '1px solid var(--border-secondary)',
      }}
    >
      <div className="w-32 shrink-0">
        <div
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {hint}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <code
          className="mono block truncate text-xs"
          style={{ color: 'var(--text-primary)' }}
          title={value}
        >
          {value}
        </code>
      </div>

      <div className="shrink-0">
        <CopyButton value={value} variant="ghost" size="sm" label="" successLabel="" />
      </div>
    </div>
  );
}
