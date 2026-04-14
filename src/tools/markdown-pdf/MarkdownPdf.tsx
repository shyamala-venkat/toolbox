import { useCallback, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

// ─── Markdown config ────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: true });

// ─── Print CSS ──────────────────────────────────────────────────────────────

/**
 * Embedded print-optimized stylesheet injected into the hidden iframe for
 * PDF export via window.print(). Designed for A4 pages with professional
 * typography, proper code blocks, and clean table rendering.
 */
const PRINT_CSS = `
@page {
  size: A4;
  margin: 2cm 2.5cm;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #1a1a1a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1 { font-size: 24pt; margin: 0 0 12pt 0; font-weight: 700; border-bottom: 1px solid #e0e0e0; padding-bottom: 6pt; }
h2 { font-size: 18pt; margin: 18pt 0 8pt 0; font-weight: 600; border-bottom: 1px solid #e0e0e0; padding-bottom: 4pt; }
h3 { font-size: 14pt; margin: 14pt 0 6pt 0; font-weight: 600; }
h4 { font-size: 12pt; margin: 12pt 0 4pt 0; font-weight: 600; }
h5 { font-size: 11pt; margin: 10pt 0 4pt 0; font-weight: 600; }
h6 { font-size: 10pt; margin: 10pt 0 4pt 0; font-weight: 600; color: #555; }

p { margin: 0 0 8pt 0; }

a { color: #2563eb; text-decoration: underline; }

ul, ol { margin: 0 0 8pt 20pt; padding: 0; }
li { margin-bottom: 2pt; }

blockquote {
  margin: 8pt 0;
  padding: 6pt 12pt;
  border-left: 3pt solid #d0d0d0;
  color: #555;
  font-style: italic;
}

pre {
  margin: 8pt 0;
  padding: 10pt 12pt;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 4pt;
  overflow-x: auto;
  font-size: 9pt;
  line-height: 1.5;
}

code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 9pt;
}

p code, li code, td code {
  padding: 1pt 4pt;
  background: #f0f0f0;
  border: 1px solid #e0e0e0;
  border-radius: 3pt;
}

pre code {
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0;
  font-size: 10pt;
}

th, td {
  border: 1px solid #d0d0d0;
  padding: 6pt 8pt;
  text-align: left;
}

th {
  background: #f5f5f5;
  font-weight: 600;
}

tr:nth-child(even) {
  background: #fafafa;
}

hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 12pt 0;
}

img {
  max-width: 100%;
  height: auto;
}

/* Task lists */
input[type="checkbox"] {
  margin-right: 4pt;
}

/* Strikethrough */
del { color: #999; }

/* Avoid page breaks inside these elements */
pre, blockquote, table, ul, ol {
  page-break-inside: avoid;
}

h1, h2, h3, h4, h5, h6 {
  page-break-after: avoid;
}
`;

// ─── Placeholder ────────────────────────────────────────────────────────────

const PLACEHOLDER = `# Document Title

Write your **Markdown** here. The right panel shows a live preview.

## Features

- GitHub Flavored Markdown support
- Tables, task lists, code blocks
- Export to PDF with clean typography

\`\`\`javascript
const greeting = "Hello, world!";
\`\`\`

| Column A | Column B |
|----------|----------|
| Data 1   | Data 2   |

> Blockquotes render cleanly in the PDF output.
`;

// ─── Component ──────────────────────────────────────────────────────────────

function MarkdownPdf() {
  const showToast = useAppStore((s) => s.showToast);
  const [input, setInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const debouncedInput = useDebounce(input, 200);

  const sanitizedHtml = useMemo(() => {
    if (debouncedInput.trim().length === 0) return '';
    const rawHtml = marked.parse(debouncedInput);
    if (typeof rawHtml !== 'string') return '';
    return DOMPurify.sanitize(rawHtml);
  }, [debouncedInput]);

  const isEmpty = input.trim().length === 0;

  // ─── Export handler ───────────────────────────────────────────────────

  const handleExportPdf = useCallback(() => {
    if (sanitizedHtml.length === 0) {
      showToast('Nothing to export. Enter some Markdown first.', 'warning');
      return;
    }

    setExporting(true);

    try {
      // Create a hidden iframe for printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);
      iframeRef.current = iframe;

      const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!iframeDoc) {
        showToast('Could not create print frame.', 'error');
        document.body.removeChild(iframe);
        setExporting(false);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Markdown Export</title>
<style>${PRINT_CSS}</style>
</head>
<body>${sanitizedHtml}</body>
</html>`);
      iframeDoc.close();

      // Wait for the iframe content to load before printing
      iframe.onload = () => {
        try {
          iframe.contentWindow?.print();
        } catch {
          showToast('Print dialog could not be opened.', 'error');
        } finally {
          // Clean up after a brief delay to allow the print dialog to open
          setTimeout(() => {
            if (iframeRef.current && document.body.contains(iframeRef.current)) {
              document.body.removeChild(iframeRef.current);
              iframeRef.current = null;
            }
            setExporting(false);
          }, 500);
        }
      };

      // Fallback: if onload doesn't fire (content already loaded synchronously)
      // trigger print directly after a brief delay
      setTimeout(() => {
        if (iframeRef.current && document.body.contains(iframeRef.current)) {
          try {
            iframeRef.current.contentWindow?.print();
          } catch {
            // Already handled above
          }
          setTimeout(() => {
            if (iframeRef.current && document.body.contains(iframeRef.current)) {
              document.body.removeChild(iframeRef.current);
              iframeRef.current = null;
            }
            setExporting(false);
          }, 500);
        }
      }, 300);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Export failed: ${msg}`, 'error');
      setExporting(false);
    }
  }, [sanitizedHtml, showToast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-4" style={{ minHeight: 0 }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {input.length} chars
            {input.length > 0 &&
              ` \u00b7 ${input.split('\n').length} line${input.split('\n').length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex items-center gap-2">
            <CopyButton
              value={sanitizedHtml}
              disabled={sanitizedHtml.length === 0}
              label="Copy HTML"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleExportPdf}
              disabled={sanitizedHtml.length === 0 || exporting}
              loading={exporting}
              leadingIcon={
                !exporting ? <Download className="h-4 w-4" /> : undefined
              }
            >
              {exporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          </div>
        </div>

        {/* Split view */}
        <div
          className="flex flex-col gap-4 lg:flex-row lg:items-stretch"
          style={{ minHeight: 0 }}
        >
          {/* Input panel */}
          <div className="flex flex-1 flex-col gap-2">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
              htmlFor="md-pdf-input"
            >
              Markdown
            </label>
            <Textarea
              id="md-pdf-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              monospace
              spellCheck={false}
              rows={24}
              aria-label="Markdown input"
            />
          </div>

          {/* Preview panel */}
          <div className="flex flex-1 flex-col gap-2">
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Preview
            </span>
            <div
              className="flex-1 overflow-auto p-4"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                minHeight: (24 * 24) + 24,
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

export default MarkdownPdf;
