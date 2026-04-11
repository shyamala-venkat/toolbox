import { useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';

// Configure marked for GitHub Flavored Markdown
marked.setOptions({ gfm: true, breaks: true });

const PLACEHOLDER = `# Hello, Markdown!

Try typing some **bold**, *italic*, or ~~strikethrough~~ text.

## Features

- [x] Tables
- [x] Task lists
- [x] Code blocks
- [ ] Your next idea

\`\`\`typescript
const greeting = "Hello, world!";
console.log(greeting);
\`\`\`

| Feature | Supported |
|---------|-----------|
| GFM     | Yes       |
| Tables  | Yes       |

> Blockquotes work too!
`;

function MarkdownPreview() {
  const [input, setInput] = useState('');
  const debouncedInput = useDebounce(input, 200);

  const sanitizedHtml = useMemo(() => {
    if (debouncedInput.trim().length === 0) return '';
    const rawHtml = marked.parse(debouncedInput);
    if (typeof rawHtml !== 'string') return '';
    return DOMPurify.sanitize(rawHtml);
  }, [debouncedInput]);

  const isEmpty = input.trim().length === 0;

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-4" style={{ minHeight: 0 }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch" style={{ minHeight: 0 }}>
          {/* Input panel */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
                htmlFor="md-input"
              >
                Markdown
              </label>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {input.length} chars
              </span>
            </div>
            <Textarea
              id="md-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              monospace
              spellCheck={false}
              rows={22}
              aria-label="Markdown input"
            />
          </div>

          {/* Output panel */}
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
                minHeight: ((22) * 24) + 24,
              }}
            >
              {isEmpty ? (
                <div
                  className="flex h-full items-center justify-center text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Start typing Markdown to see a preview
                </div>
              ) : (
                /*
                 * SECURITY EXCEPTION: dangerouslySetInnerHTML is required here to
                 * render the Markdown-to-HTML output. ALL HTML is sanitized through
                 * DOMPurify.sanitize() before being passed to this prop. This is the
                 * ONE intentional exception to the no-innerHTML rule for this tool.
                 */
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolPage>
  );
}

export default MarkdownPreview;
