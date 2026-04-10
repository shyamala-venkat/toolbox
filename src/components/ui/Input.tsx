import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leadingIcon,
      trailingIcon,
      fullWidth = true,
      className,
      id,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? `input-${generatedId}`;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {label}
          </label>
        )}
        <div
          className="relative flex items-center"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-primary)'}`,
            borderRadius: 'var(--radius-md)',
          }}
        >
          {leadingIcon && (
            <span
              className="pointer-events-none absolute left-2.5 inline-flex"
              style={{ color: 'var(--text-tertiary)' }}
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-60',
              leadingIcon ? 'pl-9' : 'pl-3',
              trailingIcon ? 'pr-9' : 'pr-3',
              className,
            )}
            style={{ color: 'var(--text-primary)' }}
            {...rest}
          />
          {trailingIcon && (
            <span
              className="absolute right-2.5 inline-flex"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {trailingIcon}
            </span>
          )}
        </div>
        {error ? (
          <p
            id={`${inputId}-error`}
            className="text-xs"
            style={{ color: 'var(--danger)' }}
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${inputId}-hint`}
            className="text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
