import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useClipboard } from '@/hooks/useClipboard';
import { useAppStore } from '@/stores/appStore';

export interface CopyButtonProps {
  value: string;
  label?: string;
  successLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}

const FEEDBACK_DURATION = 1500;

export function CopyButton({
  value,
  label = 'Copy',
  successLabel = 'Copied',
  size = 'sm',
  variant = 'secondary',
  disabled,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboard = useClipboard();
  const showToast = useAppStore((s) => s.showToast);

  const handleCopy = useCallback(async () => {
    try {
      await clipboard.write(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), FEEDBACK_DURATION);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [clipboard, value, showToast]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || value.length === 0}
      onClick={handleCopy}
      leadingIcon={
        copied ? (
          <Check className="h-4 w-4" style={{ color: 'var(--success)' }} />
        ) : (
          <Copy className="h-4 w-4" />
        )
      }
      className={className}
      aria-live="polite"
    >
      {copied ? successLabel : label}
    </Button>
  );
}
