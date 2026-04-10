import { forwardRef, useId, useMemo, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  monospace?: boolean;
  showLineNumbers?: boolean;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      monospace = false,
      showLineNumbers = false,
      fullWidth = true,
      className,
      id,
      value,
      defaultValue,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const textareaId = id ?? `textarea-${generatedId}`;
    const describedBy = error
      ? `${textareaId}-error`
      : hint
        ? `${textareaId}-hint`
        : undefined;

    // Compute line numbers from the controlled value (or fall back to
    // defaultValue so the first render isn't blank).
    const lineCount = useMemo(() => {
      if (!showLineNumbers) return 0;
      const source =
        typeof value === 'string'
          ? value
          : typeof defaultValue === 'string'
            ? defaultValue
            : '';
      return Math.max(1, source.split('\n').length);
    }, [showLineNumbers, value, defaultValue]);

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {label}
          </label>
        )}
        <div
          className="flex min-h-[120px]"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-primary)'}`,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {showLineNumbers && (
            <div
              aria-hidden="true"
              className={cn('select-none py-2 pr-2 pl-3 text-right text-xs leading-6', monospace && 'mono')}
              style={{
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border-secondary)',
                minWidth: '2.5rem',
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            id={textareaId}
            value={value}
            defaultValue={defaultValue}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full resize-y bg-transparent p-3 text-sm leading-6 outline-none placeholder:opacity-60',
              monospace && 'mono',
              className,
            )}
            style={{ color: 'var(--text-primary)' }}
            {...rest}
          />
        </div>
        {error ? (
          <p id={`${textareaId}-error`} className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : hint ? (
          <p id={`${textareaId}-hint`} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
