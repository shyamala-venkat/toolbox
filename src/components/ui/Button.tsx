import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'transition-colors duration-150 select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)]',
  md: 'h-9 px-4 text-sm rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 text-sm rounded-[var(--radius-md)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leadingIcon,
      trailingIcon,
      fullWidth = false,
      className,
      style,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    // Inline styles are used for variant coloring so CSS variables stay the
    // single source of truth. Tailwind's arbitrary values work but they'd
    // force us to ship the token name twice — inline is cleaner.
    const variantStyle: React.CSSProperties = (() => {
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
            border: '1px solid var(--accent)',
          };
        case 'secondary':
          return {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid transparent',
          };
        case 'danger':
          return {
            backgroundColor: 'var(--danger)',
            color: 'var(--text-inverse)',
            border: '1px solid var(--danger)',
          };
      }
    })();

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(BASE, SIZES[size], fullWidth && 'w-full', 'tb-btn', `tb-btn--${variant}`, className)}
        style={{ ...variantStyle, ...style }}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 tb-anim-spin" aria-hidden="true" />
        ) : (
          leadingIcon && <span className="inline-flex shrink-0">{leadingIcon}</span>
        )}
        {children && <span className="truncate">{children}</span>}
        {!loading && trailingIcon && <span className="inline-flex shrink-0">{trailingIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
