import { useCallback, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Download,
  FileMinus2,
  FileText,
  Info,
} from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { loadPdf, triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OptimizeResult {
  originalSize: number;
  optimizedSize: number;
  bytes: Uint8Array;
  pageCount: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

function PdfCompress() {
  const showToast = useAppStore((s) => s.showToast);

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  // ─── File handling ──────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        showToast(`"${f.name}" is not a PDF file.`, 'warning');
        return;
      }

      setFile(f);
      setError(null);
      setResult(null);
    },
    [showToast],
  );

  // ─── Optimize ─────────────────────────────────────────────────────────

  const handleOptimize = useCallback(async () => {
    if (!file) return;

    setOptimizing(true);
    setError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await loadPdf(buffer, file.name);
      const pageCount = pdf.getPageCount();

      const optimizedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      setResult({
        originalSize: file.size,
        optimizedSize: optimizedBytes.length,
        bytes: optimizedBytes,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setOptimizing(false);
    }
  }, [file, showToast]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const name = file.name.replace(/\.pdf$/i, '') + '_optimized.pdf';
    triggerDownload(result.bytes, name);
    showToast('Optimized PDF downloaded.', 'success');
  }, [result, file, showToast]);

  const handleClear = useCallback(() => {
    setFile(null);
    setError(null);
    setResult(null);
  }, []);

  // ─── Computed ─────────────────────────────────────────────────────────

  const savings = result
    ? result.originalSize - result.optimizedSize
    : 0;
  const savingsPercent = result
    ? Math.round(((result.originalSize - result.optimizedSize) / result.originalSize) * 100)
    : 0;
  const sizeIncreased = savings < 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* File input */}
        {!file ? (
          <FileDropZone
            onDrop={handleFile}
            accept={['.pdf', 'application/pdf']}
            multiple={false}
            label="Drop a PDF here or click to browse"
            description="Select a single PDF file to optimize."
          />
        ) : (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: `1px solid ${error ? 'var(--danger)' : 'var(--border-primary)'}`,
              borderRadius: 'var(--radius-md)',
            }}
          >
            <FileText
              className="h-5 w-5 shrink-0"
              style={{ color: error ? 'var(--danger)' : 'var(--accent)' }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="truncate text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {file.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {error ? (
                  <span style={{ color: 'var(--danger)' }}>{error}</span>
                ) : (
                  formatBytes(file.size)
                )}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={optimizing}
            >
              Change file
            </Button>
          </div>
        )}

        {/* Optimize button */}
        {file && !result && !error && (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleOptimize}
            disabled={optimizing}
            loading={optimizing}
          >
            {optimizing ? 'Optimizing...' : 'Optimize PDF'}
          </Button>
        )}

        {/* Results */}
        {result && (
          <div
            className="flex flex-col gap-4 px-4 py-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {/* Size comparison */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Original
                </span>
                <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatBytes(result.originalSize)}
                </span>
              </div>

              <ArrowRight
                className="h-5 w-5 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              />

              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Optimized
                </span>
                <span className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatBytes(result.optimizedSize)}
                </span>
              </div>

              {!sizeIncreased && savings > 0 && (
                <div
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" style={{ color: 'var(--success)' }} aria-hidden="true" />
                  <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                    {savingsPercent}% smaller ({formatBytes(Math.abs(savings))} saved)
                  </span>
                </div>
              )}

              {sizeIncreased && (
                <div
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <Info className="h-3.5 w-3.5" style={{ color: 'var(--warning)' }} aria-hidden="true" />
                  <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
                    Size slightly increased — file was already well-optimized.
                  </span>
                </div>
              )}

              {!sizeIncreased && savings === 0 && (
                <div
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--info) 12%, transparent)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--info)' }} aria-hidden="true" />
                  <span className="text-sm font-medium" style={{ color: 'var(--info)' }}>
                    No size change — file was already optimized.
                  </span>
                </div>
              )}
            </div>

            {/* Info note */}
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 text-xs"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-tertiary)',
              }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                This optimization re-encodes the PDF with object streams, typically saving 10-30%.
                For maximum compression (image downsampling, font subsetting), use a dedicated PDF
                compression tool.
              </span>
            </div>

            {/* Download */}
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleDownload}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              Download Optimized PDF
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!file && (
          <div
            className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <FileMinus2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No PDF loaded
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Upload a PDF to optimize its file size.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfCompress;
