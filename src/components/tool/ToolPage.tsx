/**
 * ToolPage — wrapper for every tool route.
 *
 * Layout (PR-B.1):
 *
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │                          page-flex (row, full height)                    │
 *   │ ┌───────────────────────────────────────────────────┐ ┌───────────────┐ │
 *   │ │                                                   │ │               │ │
 *   │ │              Tool content column                  │ │   <Drawer>    │ │
 *   │ │  (centered max-w-[960px] unless fullWidth)        │ │  rail | open  │ │
 *   │ │                                                   │ │  | + detail   │ │
 *   │ │  - <ToolHeader>                                   │ │               │ │
 *   │ │  - children (the tool's content)                  │ │               │ │
 *   │ │                                                   │ │               │ │
 *   │ └───────────────────────────────────────────────────┘ └───────────────┘ │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *
 * The drawer is a flex sibling of the tool content — NOT inside the
 * centered max-width wrapper — so it always pins to the right edge of the
 * viewport regardless of the content column's max-width. The drawer
 * decides its own width and may render nothing on narrow viewports
 * (< 1024 px) or for tools that aren't history-eligible.
 *
 * Eligibility: a tool gets a drawer only when BOTH conditions hold:
 *   - `tool.sensitiveContent !== true`  (defense-in-depth privacy)
 *   - `tool.historyEligible !== false`  (text-in/text-out shape)
 */

import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import type { ToolMeta } from '@/tools/types';
import { ToolHeader } from './ToolHeader';
import { ToolError } from './ToolError';
import { useToolHistory } from '@/hooks/useToolHistory';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { Drawer } from '@/components/history/Drawer';
import { HistoryRestoreProvider } from '@/contexts/HistoryRestoreContext';
import { cn } from '@/lib/utils';

export interface ToolPageProps {
  tool: ToolMeta;
  children: ReactNode;
  fullWidth?: boolean;
  onKeyboardShortcut?: () => void;
  /** Tool's current input. Forwarded to the drawer's DetailPanel so the
   *  Restore action can prompt before overwriting non-empty input.
   *  Optional — when absent the Restore action never confirms. */
  currentInput?: string;
}

/** Whether a tool is eligible for the right-side history drawer. */
const isHistoryEligible = (tool: ToolMeta): boolean =>
  tool.sensitiveContent !== true && tool.historyEligible !== false;

export function ToolPage({
  tool,
  children,
  fullWidth = false,
  onKeyboardShortcut,
  currentInput,
}: ToolPageProps) {
  const { pushRecent } = useToolHistory();

  useEffect(() => {
    pushRecent(tool.id);
  }, [pushRecent, tool.id]);

  // Register the tool's primary keyboard shortcut — only while mounted.
  useKeyboardShortcut(
    tool.keyboardShortcut ?? 'mod+.',
    () => {
      if (tool.keyboardShortcut && onKeyboardShortcut) onKeyboardShortcut();
    },
    { enabled: Boolean(tool.keyboardShortcut && onKeyboardShortcut) },
  );

  const eligible = isHistoryEligible(tool);

  const content = (
    <div className="flex w-full flex-1 min-w-0">
      <div
        className={cn(
          'mx-auto w-full px-6 py-8',
          fullWidth ? 'max-w-none' : 'max-w-[960px]',
        )}
      >
        <ToolHeader tool={tool} />
        <ToolErrorBoundary>{children}</ToolErrorBoundary>
      </div>
    </div>
  );

  if (!eligible) {
    // Still wrap with a no-op restore provider so tools can call
    // useHistoryRestore() unconditionally without crashing.
    return <HistoryRestoreProvider toolId={tool.id}>{content}</HistoryRestoreProvider>;
  }

  return (
    <HistoryRestoreProvider toolId={tool.id}>
      <div className="flex h-full w-full">
        {content}
        <Drawer tool={tool} currentInput={currentInput} />
      </div>
    </HistoryRestoreProvider>
  );
}

// ─── Error boundary ─────────────────────────────────────────────────────────
//
// Class component is required here: React 19 has no hook-based equivalent for
// `componentDidCatch`. We keep the class minimal and delegate the fallback UI
// to the stateless <ToolError> component.

interface ToolErrorBoundaryProps {
  children: ReactNode;
}

interface ToolErrorBoundaryState {
  error: Error | null;
}

class ToolErrorBoundary extends Component<ToolErrorBoundaryProps, ToolErrorBoundaryState> {
  override state: ToolErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ToolErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally left as a seam for a future telemetry hook. We do NOT
    // console.error here so the renderer doesn't expose a stack in prod logs.
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return <ToolError error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
