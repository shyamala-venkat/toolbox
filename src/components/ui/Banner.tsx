/**
 * Banner — single primitive for the finance pack's two banner roles:
 *
 *   1. As-of banner (Currency Converter): info / warning / danger tones,
 *      reflects rate-snapshot freshness with an inline "Refresh" action.
 *   2. Disclaimer banner (Tax / Paycheck / Mortgage / Retirement): note tone,
 *      no action, must not be dismissible.
 *
 * Color tokens are pulled exclusively from `themes.css`. ARIA role is mapped
 * from `tone` so AT users get the right interruption level (alert for danger,
 * status for info / warning, note for compliance disclaimers).
 */

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BannerTone = 'info' | 'warning' | 'danger' | 'note';

export interface BannerProps {
  tone: BannerTone;
  title: string;
  detail?: string;
  /** Optional inline link-button rendered on the right. */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

interface ToneConfig {
  icon: typeof Info;
  iconColor: string;
  borderColor: string;
  background: string;
  textColor: string;
  detailColor: string;
  role: 'status' | 'alert' | 'note';
}

const TONES: Record<BannerTone, ToneConfig> = {
  info: {
    icon: Info,
    iconColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    background: 'var(--accent-subtle)',
    textColor: 'var(--text-primary)',
    detailColor: 'var(--text-secondary)',
    role: 'status',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'var(--warning)',
    borderColor: 'var(--warning-border)',
    background: 'var(--warning-subtle)',
    textColor: 'var(--text-primary)',
    detailColor: 'var(--text-secondary)',
    role: 'status',
  },
  danger: {
    icon: AlertCircle,
    iconColor: 'var(--danger)',
    borderColor: 'var(--danger-border)',
    background: 'var(--danger-subtle)',
    textColor: 'var(--text-primary)',
    detailColor: 'var(--text-secondary)',
    role: 'alert',
  },
  note: {
    icon: Info,
    iconColor: 'var(--text-tertiary)',
    borderColor: 'var(--border-primary)',
    background: 'var(--bg-secondary)',
    textColor: 'var(--text-secondary)',
    detailColor: 'var(--text-tertiary)',
    role: 'note',
  },
};

export function Banner({
  tone,
  title,
  detail,
  actionLabel,
  onAction,
  className,
}: BannerProps): ReactNode {
  const config = TONES[tone];
  const Icon = config.icon;
  const showAction = Boolean(actionLabel && onAction);

  return (
    <div
      role={config.role}
      aria-live={config.role === 'alert' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        'sm:items-center',
        className,
      )}
      style={{
        backgroundColor: config.background,
        border: `1px solid ${config.borderColor}`,
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0"
        style={{ color: config.iconColor }}
        aria-hidden="true"
      />
      <div className="flex-1 text-sm">
        <span className="font-semibold" style={{ color: config.textColor }}>
          {title}
        </span>
        {detail && (
          <span
            className="ml-2"
            style={{ color: config.detailColor }}
          >
            {detail}
          </span>
        )}
      </div>
      {showAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: config.iconColor }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
