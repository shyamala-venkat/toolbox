import type { ToolHistoryKind } from '@/tools/types';

interface HistoryViewerProps {
  /** Raw stored content. Pass it through unmodified. */
  content: string;
  kind?: ToolHistoryKind;
  /** Visible label for screen readers / inspector. */
  label: string;
}

/**
 * Read-only viewer for stored history payloads. Deliberately lightweight:
 * we render content as a plain `<pre>` styled with theme variables. JSON
 * gets a soft pretty-print pass when it parses cleanly. Other kinds render
 * verbatim — a heavy syntax highlighter would break the dependency policy
 * and burn a chunk's worth of bundle for content the user reads once.
 *
 * Why JSX text rendering and not raw-HTML injection: the entire payload
 * is user-supplied text. React's JSX escaping is exactly the right
 * behavior — every character is rendered as its literal codepoint and no
 * DOM is created from the string. See CLAUDE.md security invariant #2.
 */
export function HistoryViewer({ content, kind = 'text', label }: HistoryViewerProps) {
  const display = formatForKind(content, kind);

  return (
    <pre
      role="region"
      aria-label={label}
      className="mono overflow-auto whitespace-pre-wrap break-words text-xs leading-5"
      style={{
        backgroundColor: 'var(--surface-1)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        margin: 0,
        maxHeight: '50vh',
      }}
    >
      {display.length > 0 ? display : (
        <span style={{ color: 'var(--text-tertiary)' }}>(empty)</span>
      )}
    </pre>
  );
}

/**
 * Best-effort formatting per kind. Kept narrow on purpose — we want
 * predictable behavior, not an editor. Anything that fails to format gets
 * rendered as-is.
 */
function formatForKind(content: string, kind: ToolHistoryKind): string {
  if (kind === 'json') {
    try {
      const parsed = JSON.parse(content) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content;
    }
  }
  return content;
}
