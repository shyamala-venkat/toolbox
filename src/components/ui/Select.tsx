import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  children?: ReactNode;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      fullWidth = true,
      className,
      id,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id ?? `select-${generatedId}`;
    const describedBy = error
      ? `${selectId}-error`
      : hint
        ? `${selectId}-hint`
        : undefined;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={selectId}
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
          <select
            ref={ref}
            id={selectId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-9 w-full appearance-none bg-transparent pr-8 pl-3 text-sm outline-none',
              className,
            )}
            style={{ color: 'var(--text-primary)' }}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 h-4 w-4"
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
        </div>
        {error ? (
          <p id={`${selectId}-error`} className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : hint ? (
          <p id={`${selectId}-hint`} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
