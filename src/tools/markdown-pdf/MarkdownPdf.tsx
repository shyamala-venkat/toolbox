import { useCallback, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { pdf } from '@react-pdf/renderer';
import { save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { writeBinaryFile } from '@/lib/tauri';
import { MarkdownPdfDocument } from './MarkdownPdfDocument';
import { tokenizeForPdf } from './markdownToPdfTokens';
import { meta } from './meta';

// ─── Markdown config ────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: true });

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
  const debouncedInput = useDebounce(input, 200);

  const sanitizedHtml = useMemo(() => {
    if (debouncedInput.trim().length === 0) return '';
    const rawHtml = marked.parse(debouncedInput);
    if (typeof rawHtml !== 'string') return '';
    return DOMPurify.sanitize(rawHtml);
  }, [debouncedInput]);

  const isEmpty = input.trim().length === 0;

  // ─── Export handler ───────────────────────────────────────────────────
  //
  // Pipeline:
  //   1. Tokenize the markdown via marked.lexer().
  //   2. Render those tokens to a React-PDF <Document> (vector text).
  //   3. Generate a PDF blob via @react-pdf/renderer's `pdf()` helper.
  //   4. Show a Tauri Save dialog → user picks the destination.
  //   5. Write the bytes via the `write_binary_file` Rust IPC (path-
  //      validated, 100 MB cap, refuses symlinks).
  //
  // Output is searchable vector text — Cmd-F finds words inside the
  // saved PDF, scaling looks crisp on Retina, and file size stays
  // proportional to content rather than rasterization DPI.

  const handleExportPdf = useCallback(async () => {
    if (input.trim().length === 0) {
      showToast('Nothing to export. Enter some Markdown first.', 'warning');
      return;
    }

    setExporting(true);

    try {
      const target = await save({
        title: 'Save PDF',
        defaultPath: 'markdown-export.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!target) {
        // User cancelled the dialog. Quietly exit — no toast needed.
        return;
      }

      const tokens = tokenizeForPdf(input);
      const blob = await pdf(<MarkdownPdfDocument tokens={tokens} />).toBlob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeBinaryFile(target, bytes);

      showToast('Saved PDF', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Export failed: ${msg}`, 'error');
    } finally {
      setExporting(false);
    }
  }, [input, showToast]);

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
