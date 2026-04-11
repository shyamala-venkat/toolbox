import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';

const PLACEHOLDER = `<h1>Hello, HTML!</h1>
<p>Try typing some <strong>bold</strong>, <em>italic</em>, or <a href="#">linked</a> text.</p>
<ul>
  <li>Unordered list item</li>
  <li>Another item</li>
</ul>
<table>
  <tr><th>Name</th><th>Value</th></tr>
  <tr><td>Alpha</td><td>1</td></tr>
  <tr><td>Beta</td><td>2</td></tr>
</table>`;

/**
 * Simple HTML syntax highlighting for the "Show source" view.
 * Returns an array of spans styled with CSS variables. No innerHTML needed
 * here — this renders React elements, not raw HTML strings.
 */
function highlightHtml(source: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Tokenize into tags and text
  const regex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][^>]*\/?>)|([^<]+)/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(source)) !== null) {
    if (match[1]) {
      // Comment
      parts.push(
        <span key={idx++} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {match[1]}
        </span>,
      );
    } else if (match[2]) {
      // Tag
      parts.push(
        <span key={idx++} style={{ color: 'var(--accent)' }}>
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // Text content
      parts.push(<span key={idx++}>{match[3]}</span>);
    }
  }

  return parts;
}

function HtmlPreview() {
  const [input, setInput] = useState('');
  const [showSource, setShowSource] = useState(false);

  const debouncedInput = useDebounce(input, 200);

  const sanitizedHtml = useMemo(() => {
    if (debouncedInput.trim().length === 0) return '';
    return DOMPurify.sanitize(debouncedInput);
  }, [debouncedInput]);

  const highlighted = useMemo(() => {
    if (!showSource || debouncedInput.trim().length === 0) return null;
    return highlightHtml(debouncedInput);
  }, [showSource, debouncedInput]);

  const isEmpty = input.trim().length === 0;

  return (
    <ToolPage tool={meta} fullWidth>
      {/* Options bar */}
      <div
        className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Toggle
          checked={showSource}
          onChange={setShowSource}
          label="Show source"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch" style={{ minHeight: 0 }}>
        {/* Input panel */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
              htmlFor="html-input"
            >
              HTML
            </label>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {input.length} chars
            </span>
          </div>
          <Textarea
            id="html-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={PLACEHOLDER}
            monospace
            spellCheck={false}
            rows={showSource ? 16 : 22}
            aria-label="HTML input"
          />
        </div>

        {/* Output column: preview + optional source */}
        <div className="flex flex-1 flex-col gap-4">
          {/* Rendered preview */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Preview
              </span>
              <CopyButton value={sanitizedHtml} disabled={sanitizedHtml.length === 0} label="Copy HTML" />
            </div>
            <div
              className="flex-1 overflow-auto p-4"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                minHeight: showSource ? 200 : ((22) * 24) + 24,
              }}
            >
              {isEmpty ? (
                <div
                  className="flex h-full items-center justify-center text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Start typing HTML to see a preview
                </div>
              ) : (
                /*
                 * SECURITY EXCEPTION: dangerouslySetInnerHTML is required here to
                 * render the user's HTML input. ALL HTML is sanitized through
                 * DOMPurify.sanitize() before being passed to this prop. This is the
                 * ONE intentional exception to the no-innerHTML rule for this tool.
                 */
                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              )}
            </div>
          </div>

          {/* Source view (when toggled on) */}
          {showSource && (
            <div className="flex flex-col gap-2">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Source (highlighted)
              </span>
              <div
                className="mono overflow-auto p-3 text-xs leading-6"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  minHeight: 120,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {isEmpty ? (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Source will appear here
                  </span>
                ) : (
                  highlighted
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolPage>
  );
}

export default HtmlPreview;
