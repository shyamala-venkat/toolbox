import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FilePlus2,
  GripVertical,
  Loader2,
  X,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PdfEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number | null;
  error: string | null;
  buffer: ArrayBuffer | null;
}

let entryIdCounter = 0;
const nextId = (): string => `pdf-${++entryIdCounter}`;

// ─── Component ──────────────────────────────────────────────────────────────

function PdfMerge() {
  const showToast = useAppStore((s) => s.showToast);
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const dragSrcIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ─── File handling ──────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (files: File[]) => {
      const pdfFiles = files.filter((f) => {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) return true;
        showToast(`"${f.name}" is not a PDF file.`, 'warning');
        return false;
      });
      if (pdfFiles.length === 0) return;

      const newEntries: PdfEntry[] = pdfFiles.map((f) => ({
        id: nextId(),
        file: f,
        name: f.name,
        size: f.size,
        pageCount: null,
        error: null,
        buffer: null,
      }));

      setEntries((prev) => [...prev, ...newEntries]);

      // Load each PDF in parallel to get page counts
      for (const entry of newEntries) {
        try {
          const buffer = await entry.file.arrayBuffer();
          const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
          const pageCount = pdf.getPageCount();
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, pageCount, buffer } : e,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isEncrypted =
            msg.toLowerCase().includes('encrypt') || msg.toLowerCase().includes('password');
          const friendlyMsg = isEncrypted
            ? 'Password-protected'
            : 'Could not read this PDF';
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, error: friendlyMsg } : e,
            ),
          );
          showToast(`"${entry.name}": ${friendlyMsg}`, 'warning');
        }
      }
    },
    [showToast],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

  // ─── Drag-to-reorder ───────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      dragSrcIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
      // Needed for Firefox
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIndex(null);
      const srcIndex = dragSrcIndex.current;
      if (srcIndex === null || srcIndex === targetIndex) return;

      setEntries((prev) => {
        const next = [...prev];
        const [moved] = next.splice(srcIndex, 1);
        if (!moved) return prev;
        next.splice(targetIndex, 0, moved);
        return next;
      });
      dragSrcIndex.current = null;
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    dragSrcIndex.current = null;
    setDragOverIndex(null);
  }, []);

  // ─── Merge ──────────────────────────────────────────────────────────────

  const validEntries = entries.filter((e) => e.buffer !== null && e.error === null);

  const handleMerge = useCallback(async () => {
    if (validEntries.length < 2) {
      showToast('Add at least 2 valid PDFs to merge.', 'warning');
      return;
    }

    setMerging(true);
    setProgress('Creating merged document...');

    try {
      const merged = await PDFDocument.create();
      let totalPages = 0;

      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i]!;
        setProgress(`Adding "${entry.name}" (${i + 1}/${validEntries.length})...`);

        try {
          const source = await PDFDocument.load(entry.buffer!, { ignoreEncryption: true });
          const indices = source.getPageIndices();
          const pages = await merged.copyPages(source, indices);
          for (const page of pages) {
            merged.addPage(page);
            totalPages++;
          }
        } catch {
          showToast(`Skipped "${entry.name}" — could not read pages.`, 'warning');
        }
      }

      if (totalPages === 0) {
        showToast('No pages could be extracted from the selected files.', 'error');
        return;
      }

      setProgress(`Saving merged PDF (${totalPages} pages)...`);
      const bytes = await merged.save();
      triggerDownload(bytes, 'merged.pdf');
      showToast(`Merged ${validEntries.length} files (${totalPages} pages).`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Merge failed: ${msg}`, 'error');
    } finally {
      setMerging(false);
      setProgress(null);
    }
  }, [validEntries, showToast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const totalPageCount = entries.reduce((acc, e) => acc + (e.pageCount ?? 0), 0);
  const errorCount = entries.filter((e) => e.error !== null).length;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Drop zone */}
        <FileDropZone
          onDrop={addFiles}
          accept={['.pdf', 'application/pdf']}
          multiple
          label="Drop PDFs here or click to browse"
          description={
            <span>
              Select multiple PDF files to merge.
              {entries.length > 0 && (
                <> Currently {entries.length} file{entries.length !== 1 ? 's' : ''} added.</>
              )}
            </span>
          }
        />

        {/* File list */}
        {entries.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {entries.length} file{entries.length !== 1 ? 's' : ''}
                {totalPageCount > 0 && ` \u00b7 ${totalPageCount} pages total`}
                {errorCount > 0 && (
                  <span style={{ color: 'var(--warning)' }}>
                    {' '}\u00b7 {errorCount} with errors
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={merging}
              >
                Clear all
              </Button>
            </div>

            <div
              className="flex flex-col gap-1 overflow-y-auto"
              style={{
                maxHeight: '360px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  draggable={!merging}
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver(index)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-100"
                  style={{
                    backgroundColor:
                      dragOverIndex === index
                        ? 'var(--accent-subtle)'
                        : 'var(--bg-secondary)',
                    border: `1px solid ${
                      entry.error
                        ? 'var(--warning)'
                        : dragOverIndex === index
                          ? 'var(--accent)'
                          : 'var(--border-primary)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    cursor: merging ? 'default' : 'grab',
                  }}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {entry.name}
                    </span>
                    <span
                      className="text-xs"
                      style={{
                        color: entry.error
                          ? 'var(--warning)'
                          : 'var(--text-tertiary)',
                      }}
                    >
                      {entry.error ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="inline h-3 w-3" aria-hidden="true" />
                          {entry.error}
                        </span>
                      ) : entry.pageCount !== null ? (
                        `${entry.pageCount} page${entry.pageCount !== 1 ? 's' : ''} \u00b7 ${formatBytes(entry.size)}`
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="inline h-3 w-3 tb-anim-spin" aria-hidden="true" />
                          Loading...
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => removeEntry(entry.id)}
                    disabled={merging}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors duration-100"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {entries.length === 0 && (
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
              <FilePlus2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No PDFs added yet
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Drop files above or click to browse. You can reorder files by dragging.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleMerge}
              disabled={validEntries.length < 2 || merging}
              loading={merging}
              leadingIcon={
                !merging ? <Download className="h-4 w-4" /> : undefined
              }
            >
              {merging ? 'Merging...' : `Merge ${validEntries.length} PDF${validEntries.length !== 1 ? 's' : ''}`}
            </Button>
            {progress && (
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
                aria-live="polite"
              >
                {progress}
              </span>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfMerge;
