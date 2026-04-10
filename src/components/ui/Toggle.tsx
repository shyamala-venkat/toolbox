import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, label, description, disabled, id, className }, ref) => {
    const handleClick = (): void => {
      if (disabled) return;
      onChange(!checked);
    };

    const button = (
      <button
        ref={ref}
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'tb-toggle-track relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        data-on={checked}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 rounded-full shadow-sm transition-transform duration-150',
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
          )}
          style={{ backgroundColor: 'var(--bg-primary)' }}
        />
      </button>
    );

    if (!label && !description) return button;

    return (
      <label
        className={cn(
          'flex items-start justify-between gap-4',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex flex-col gap-0.5">
          {label && (
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </span>
          )}
        </span>
        {button}
      </label>
    );
  },
);

Toggle.displayName = 'Toggle';
