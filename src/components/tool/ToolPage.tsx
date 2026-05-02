/**
 * ToolPage — wrapper for every tool route.
 *
 * Layout (post-PR-B revision):
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │                                                       │
 *   │   <ToolHeader>                                        │
 *   │                                                       │
 *   │   ┌────────┐┌──────────┐                              │
 *   │   │ Editor ││ Recent N │   ← <EditorHistoryTabs>      │
 *   │   └────────┴──────────┴───────────────────────────    │
 *   │                                                       │
 *   │   <children> when Editor tab is active                │
 *   │   <RecentList> when Recent tab is active              │
 *   │                                                       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Centered max-w-[960px] unless `fullWidth`. The earlier right-side
 * drawer pattern was removed — the inline tab pattern tested better with
 * users (less visual clutter, history is fully on-demand, no slim rail
 * masquerading as a scrollbar).
 *
 * Eligibility: a tool gets the Recent tab only when BOTH conditions hold:
 *   - `tool.sensitiveContent !== true`  (defense-in-depth privacy)
 *   - `tool.historyEligible !== false`  (text-in/text-out shape)
 *
 * Ineligible tools render their content without the tab chrome.
 */

import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import type { ToolMeta } from '@/tools/types';
import { ToolHeader } from './ToolHeader';
import { ToolError } from './ToolError';
import { useToolHistory } from '@/hooks/useToolHistory';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { EditorHistoryTabs } from '@/components/history/EditorHistoryTabs';
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

  return (
    <HistoryRestoreProvider toolId={tool.id}>
      <div
        className={cn(
          'mx-auto w-full px-6 py-8',
          fullWidth ? 'max-w-none' : 'max-w-[960px]',
        )}
      >
        <ToolHeader tool={tool} />
        {eligible ? (
          <EditorHistoryTabs tool={tool} currentInput={currentInput}>
            <ToolErrorBoundary>{children}</ToolErrorBoundary>
          </EditorHistoryTabs>
        ) : (
          <ToolErrorBoundary>{children}</ToolErrorBoundary>
        )}
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
