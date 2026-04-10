import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useAppStore, type ToastType } from '@/stores/appStore';
import { cn } from '@/lib/utils';

const AUTO_DISMISS_MS = 5000;

const ICON: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const ACCENT: Record<ToastType, string> = {
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--danger)',
};

export function Toast() {
  const toast = useAppStore((s) => s.toast);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    // If the toast has an action, keep it until the user acts on it.
    if (toast.action) return;
    dismissTimer.current = setTimeout(() => dismissToast(), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [toast, dismissToast]);

  if (!toast) return null;

  const Icon = ICON[toast.type];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'tb-anim-fade-in-up pointer-events-none fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2',
      )}
    >
      <div
        className="pointer-events-auto flex items-start gap-3 px-4 py-3 shadow-lg"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)',
          borderLeft: `3px solid ${ACCENT[toast.type]}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: '280px',
          maxWidth: '420px',
        }}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT[toast.type] }} aria-hidden="true" />
        <div className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
          {toast.message}
        </div>
        {toast.action && (
          <button
            type="button"
            className="text-xs font-medium"
            style={{ color: 'var(--accent)' }}
            onClick={() => {
              toast.action?.onClick();
              dismissToast();
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={dismissToast}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
