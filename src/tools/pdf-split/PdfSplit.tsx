import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Scissors,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatBytes } from '@/lib/utils';
import { loadPdf, parsePageRange, triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type SplitMode = 'range' | 'every-n';

interface SplitDefaults {
  mode: SplitMode;
}

const DEFAULTS: SplitDefaults = { mode: 'range' };

const isSplitMode = (v: unknown): v is SplitMode => v === 'range' || v === 'every-n';

const sanitizeDefaults = (raw: unknown): SplitDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    mode: isSplitMode(obj.mode) ? obj.mode : DEFAULTS.mode,
  };
};

interface SplitChunk {
  label: string;
  pages: number[]; // 0-indexed
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build chunk descriptions for "every N pages" mode */
function buildEveryNChunks(total: number, n: number): SplitChunk[] {
  if (n < 1 || total < 1) return [];
  const chunks: SplitChunk[] = [];
  for (let start = 0; start < total; start += n) {
    const end = Math.min(start + n, total);
    const pages = Array.from({ length: end - start }, (_, i) => start + i);
    chunks.push({
      label: `Pages ${start + 1}-${end}`,
      pages,
    });
  }
  return chunks;
}

// ─── Component ──────────────────────────────────────────────────────────────

function PdfSplit() {
  const showToast = useAppStore((s) => s.showToast);
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo(
    () => sanitizeDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<SplitMode>(initial.mode);
  const [rangeInput, setRangeInput] = useState('');
  const [everyN, setEveryN] = useState('2');
  const [splitting, setSplitting] = useState(false);

  // Persist mode
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    update({ toolDefaults: { ...allDefaults, [meta.id]: { mode } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      setPageCount(0);
      setBuffer(null);

      try {
        const buf = await f.arrayBuffer();
        const pdf = await loadPdf(buf, f.name);
        setPageCount(pdf.getPageCount());
        setBuffer(buf);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        showToast(msg, 'error');
      }
    },
    [showToast],
  );

  // ─── Split computation ──────────────────────────────────────────────────

  const chunks: SplitChunk[] = useMemo(() => {
    if (pageCount === 0) return [];
    if (mode === 'every-n') {
      const n = parseInt(everyN, 10);
      if (isNaN(n) || n < 1) return [];
      return buildEveryNChunks(pageCount, n);
    }
    // range mode
    if (!rangeInput.trim()) return [];
    const parsed = parsePageRange(rangeInput, pageCount);
    if (!parsed) return [];
    return [{ label: `Pages: ${rangeInput.trim()}`, pages: parsed }];
  }, [mode, pageCount, rangeInput, everyN]);

  const rangeError = useMemo(() => {
    if (mode !== 'range' || !rangeInput.trim() || pageCount === 0) return null;
    const parsed = parsePageRange(rangeInput, pageCount);
    if (!parsed) return `Invalid range. Use 1-indexed pages up to ${pageCount} (e.g. "1-5, 8").`;
    return null;
  }, [mode, rangeInput, pageCount]);

  // ─── Split action ─────────────────────────────────────────────────────

  const handleSplit = useCallback(async () => {
    if (!buffer || chunks.length === 0) return;

    setSplitting(true);
    try {
      const source = await PDFDocument.load(buffer, { ignoreEncryption: true });

      if (chunks.length === 1) {
        // Single output: download directly
        const chunk = chunks[0]!;
        const out = await PDFDocument.create();
        const copied = await out.copyPages(source, chunk.pages);
        for (const p of copied) out.addPage(p);
        const bytes = await out.save();
        triggerDownload(bytes, `split_${chunk.label.replace(/\s+/g, '_')}.pdf`);
        showToast(`Split complete: ${chunk.pages.length} page${chunk.pages.length !== 1 ? 's' : ''}.`, 'success');
      } else {
        // Multiple outputs: ZIP them
        const zipEntries: Record<string, Uint8Array> = {};
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]!;
          const out = await PDFDocument.create();
          const copied = await out.copyPages(source, chunk.pages);
          for (const p of copied) out.addPage(p);
          const bytes = await out.save();
          zipEntries[`part_${i + 1}.pdf`] = bytes;
        }
        const zipped = zipSync(zipEntries, { level: 0 });
        triggerDownload(
          new Blob([zipped], { type: 'application/zip' }),
          `${(file?.name ?? 'split').replace(/\.pdf$/i, '')}_split.zip`,
        );
        showToast(`Split into ${chunks.length} files and zipped.`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Split failed: ${msg}`, 'error');
    } finally {
      setSplitting(false);
    }
  }, [buffer, chunks, file, showToast]);

  const handleClear = useCallback(() => {
    setFile(null);
    setBuffer(null);
    setPageCount(0);
    setError(null);
    setRangeInput('');
  }, []);

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
            description="Select a single PDF file to split."
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
                  `${pageCount} page${pageCount !== 1 ? 's' : ''} \u00b7 ${formatBytes(file.size)}`
                )}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={splitting}
            >
              Change file
            </Button>
          </div>
        )}

        {/* Split options */}
        {pageCount > 0 && !error && (
          <div
            className="flex flex-col gap-4 px-4 py-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Select
                  label="Split mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as SplitMode)}
                  options={[
                    { value: 'range', label: 'Page range' },
                    { value: 'every-n', label: 'Every N pages' },
                  ]}
                />
              </div>

              {mode === 'range' && (
                <div className="w-64">
                  <Input
                    label="Page range"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="e.g. 1-5, 8, 10-12"
                    error={rangeError ?? undefined}
                    hint={`Pages 1 to ${pageCount}`}
                    aria-label="Page range to extract"
                  />
                </div>
              )}

              {mode === 'every-n' && (
                <div className="w-32">
                  <Input
                    label="Pages per file"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pageCount}
                    value={everyN}
                    onChange={(e) => setEveryN(e.target.value)}
                    hint={`1 to ${pageCount}`}
                    aria-label="Number of pages per split file"
                  />
                </div>
              )}
            </div>

            {/* Preview */}
            {chunks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Output preview ({chunks.length} file{chunks.length !== 1 ? 's' : ''})
                </span>
                <div className="flex flex-wrap gap-2">
                  {chunks.map((chunk, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Scissors className="h-3 w-3" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                      {chunk.label} ({chunk.pages.length} pg)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {pageCount > 0 && !error && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSplit}
              disabled={chunks.length === 0 || splitting}
              loading={splitting}
              leadingIcon={
                !splitting ? <Download className="h-4 w-4" /> : undefined
              }
            >
              {splitting
                ? 'Splitting...'
                : chunks.length > 1
                  ? `Split & Download ZIP (${chunks.length} files)`
                  : 'Split & Download'}
            </Button>
          </div>
        )}

        {/* Empty state when no file */}
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
              <Scissors className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No PDF loaded
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Upload a PDF above to split by page range or every N pages.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfSplit;
