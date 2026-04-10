import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import type { ToolMeta } from '@/tools/types';
import { ToolHeader } from './ToolHeader';
import { ToolError } from './ToolError';
import { useToolHistory } from '@/hooks/useToolHistory';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { cn } from '@/lib/utils';

export interface ToolPageProps {
  tool: ToolMeta;
  children: ReactNode;
  fullWidth?: boolean;
  onKeyboardShortcut?: () => void;
}

/**
 * Wrapper for every tool page:
 *   - Renders the header (icon, name, description, favorite star).
 *   - Pushes the tool to the recent list on mount.
 *   - Registers the tool's keyboard shortcut (if any) while mounted.
 *   - Catches render errors in children and shows a recovery UI.
 *
 * Phase 3 tools should render `<ToolPage tool={meta}><Content /></ToolPage>`
 * and never duplicate the header or history handling themselves.
 */
export function ToolPage({ tool, children, fullWidth = false, onKeyboardShortcut }: ToolPageProps) {
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

  return (
    <div
      className={cn(
        'mx-auto w-full px-6 py-8',
        fullWidth ? 'max-w-none' : 'max-w-[960px]',
      )}
    >
      <ToolHeader tool={tool} />
      <ToolErrorBoundary>{children}</ToolErrorBoundary>
    </div>
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
