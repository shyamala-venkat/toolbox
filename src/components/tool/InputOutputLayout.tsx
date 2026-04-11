import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface InputOutputLayoutProps {
  input: ReactNode;
  output: ReactNode;
  actions?: ReactNode;
  direction?: 'horizontal' | 'vertical';
  onSwap?: () => void;
}

/**
 * Two-panel layout used by most tools (input → process → output).
 *
 * At viewport widths below 800px the layout forces vertical stack regardless
 * of the `direction` prop so the panels remain readable. The `actions` slot
 * renders between the two panels (or above the output in vertical mode) and
 * is the conventional home for "Process", "Clear", "Swap" buttons.
 */
export function InputOutputLayout({
  input,
  output,
  actions,
  direction = 'horizontal',
  onSwap,
}: InputOutputLayoutProps) {
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 800;
  });

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 799px)');
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    setIsNarrow(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const effectiveDirection = isNarrow ? 'vertical' : direction;

  return (
    <div
      className={cn(
        'flex w-full',
        effectiveDirection === 'horizontal' ? 'flex-row items-stretch' : 'flex-col',
        'gap-4',
      )}
    >
      <div className="flex flex-1 flex-col">{input}</div>

      {(actions || onSwap) && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center gap-2',
            effectiveDirection === 'horizontal' ? 'flex-col' : 'flex-row',
          )}
        >
          {onSwap && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onSwap}
              aria-label="Swap input and output"
              leadingIcon={
                effectiveDirection === 'horizontal' ? (
                  <ArrowLeftRight className="h-4 w-4" />
                ) : (
                  <ArrowUpDown className="h-4 w-4" />
                )
              }
            />
          )}
          {actions}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">{output}</div>
    </div>
  );
}
