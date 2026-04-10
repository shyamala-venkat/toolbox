import { useCallback, useRef, useState } from 'react';
import {
  Download,
  FileText,
  LayoutGrid,
  Loader2,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { loadPdf, triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PageEntry {
  /** Original 1-indexed page number from the source PDF */
  originalPage: number;
  /** Rotation offset applied by the user (0, 90, 180, 270) */
  rotation: number;
  /** Thumbnail data URL */
  thumbnail: string | null;
  /** Unique key for React */
  key: string;
}

let keyCounter = 0;
const nextKey = (): string => `pg-${++keyCounter}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

let pdfjsInitialized = false;

async function getPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsInitialized) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).href;
    pdfjsInitialized = true;
  }
  return pdfjsLib;
}

// ─── Component ──────────────────────────────────────────────────────────────

function PdfPages() {
  const showToast = useAppStore((s) => s.showToast);

  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const dragSrcIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const epochRef = useRef(0);

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
      setPages([]);
      setSelectedKeys(new Set());
      setHasChanges(false);
      setLoading(true);

      const myEpoch = ++epochRef.current;

      try {
        const buf = await f.arrayBuffer();
        // Validate with pdf-lib
        await loadPdf(buf, f.name);

        // Get page count and render thumbnails with pdfjs
        const pdfjsLib = await getPdfjs();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const count = pdf.numPages;

        const entries: PageEntry[] = [];
        for (let i = 1; i <= count; i++) {
          entries.push({
            originalPage: i,
            rotation: 0,
            thumbnail: null,
            key: nextKey(),
          });
        }

        if (epochRef.current !== myEpoch) {
          pdf.destroy();
          return;
        }
        setBuffer(buf);
        setPages(entries);

        // Render thumbnails progressively
        for (let i = 0; i < count; i++) {
          if (epochRef.current !== myEpoch) {
            pdf.destroy();
            return;
          }
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');
            const entryKey = entries[i]!.key;
            setPages((prev) =>
              prev.map((p) =>
                p.key === entryKey ? { ...p, thumbnail: dataUrl } : p,
              ),
            );
          }
          page.cleanup();
        }
        pdf.destroy();
      } catch (err) {
        if (epochRef.current === myEpoch) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          showToast(msg, 'error');
        }
      } finally {
        if (epochRef.current === myEpoch) {
          setLoading(false);
        }
      }
    },
    [showToast],
  );

  // ─── Selection ──────────────────────────────────────────────────────────

  const toggleSelect = useCallback(
    (key: string, shiftKey: boolean) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (shiftKey && prev.size > 0) {
          // Shift-click: select range
          const lastSelected = Array.from(prev).pop();
          const lastIndex = pages.findIndex((p) => p.key === lastSelected);
          const currentIndex = pages.findIndex((p) => p.key === key);
          if (lastIndex !== -1 && currentIndex !== -1) {
            const lo = Math.min(lastIndex, currentIndex);
            const hi = Math.max(lastIndex, currentIndex);
            for (let i = lo; i <= hi; i++) {
              const pageKey = pages[i]?.key;
              if (pageKey) next.add(pageKey);
            }
          }
        } else {
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
        }
        return next;
      });
    },
    [pages],
  );

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(pages.map((p) => p.key)));
  }, [pages]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  // ─── Page operations ────────────────────────────────────────────────────

  const rotateSelected = useCallback(
    (angle: number) => {
      if (selectedKeys.size === 0) return;
      setPages((prev) =>
        prev.map((p) =>
          selectedKeys.has(p.key)
            ? { ...p, rotation: (p.rotation + angle) % 360 }
            : p,
        ),
      );
      setHasChanges(true);
    },
    [selectedKeys],
  );

  const deleteSelected = useCallback(() => {
    if (selectedKeys.size === 0) return;
    if (selectedKeys.size === pages.length) {
      showToast('Cannot delete all pages.', 'warning');
      return;
    }
    setPages((prev) => prev.filter((p) => !selectedKeys.has(p.key)));
    setSelectedKeys(new Set());
    setHasChanges(true);
  }, [selectedKeys, pages.length, showToast]);

  // ─── Drag-to-reorder ───────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      dragSrcIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
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

      setPages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(srcIndex, 1);
        if (!moved) return prev;
        next.splice(targetIndex, 0, moved);
        return next;
      });
      setHasChanges(true);
      dragSrcIndex.current = null;
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    dragSrcIndex.current = null;
    setDragOverIndex(null);
  }, []);

  // ─── Save ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!buffer || pages.length === 0) return;

    setSaving(true);
    try {
      const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const output = await PDFDocument.create();

      const indices = pages.map((p) => p.originalPage - 1);
      const copiedPages = await output.copyPages(source, indices);

      for (let i = 0; i < copiedPages.length; i++) {
        const copied = copiedPages[i]!;
        const entry = pages[i]!;
        if (entry.rotation !== 0) {
          const currentRotation = copied.getRotation().angle;
          copied.setRotation(degrees(currentRotation + entry.rotation));
        }
        output.addPage(copied);
      }

      const bytes = await output.save();
      const stem = (file?.name ?? 'edited').replace(/\.pdf$/i, '');
      triggerDownload(bytes, `${stem}_edited.pdf`);
      showToast(`Saved ${pages.length} pages.`, 'success');
      setHasChanges(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Save failed: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [buffer, pages, file, showToast]);

  const handleClear = useCallback(() => {
    epochRef.current++;
    setFile(null);
    setBuffer(null);
    setError(null);
    setPages([]);
    setSelectedKeys(new Set());
    setHasChanges(false);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-5">
        {/* File input */}
        {!file ? (
          <FileDropZone
            onDrop={handleFile}
            accept={['.pdf', 'application/pdf']}
            multiple={false}
            label="Drop a PDF here or click to browse"
            description="Select a PDF to manage its pages."
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
                  `${pages.length} page${pages.length !== 1 ? 's' : ''} \u00b7 ${formatBytes(file.size)}`
                )}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={loading || saving}
            >
              Change file
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ color: 'var(--text-tertiary)' }}
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 tb-anim-spin" aria-hidden="true" />
            <span className="text-xs">Loading page thumbnails...</span>
          </div>
        )}

        {/* Toolbar */}
        {pages.length > 0 && !error && (
          <div
            className="flex flex-wrap items-center gap-2 px-3 py-2.5"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {selectedKeys.size > 0
                ? `${selectedKeys.size} selected`
                : `${pages.length} pages`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>|</span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectedKeys.size === pages.length ? deselectAll : selectAll}
            >
              {selectedKeys.size === pages.length ? 'Deselect all' : 'Select all'}
            </Button>

            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>|</span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => rotateSelected(90)}
              disabled={selectedKeys.size === 0}
              leadingIcon={<RotateCw className="h-3.5 w-3.5" />}
            >
              Rotate 90
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => rotateSelected(180)}
              disabled={selectedKeys.size === 0}
            >
              Rotate 180
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => rotateSelected(270)}
              disabled={selectedKeys.size === 0}
            >
              Rotate 270
            </Button>

            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>|</span>

            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={deleteSelected}
              disabled={selectedKeys.size === 0}
              leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Delete
            </Button>

            <div className="ml-auto">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || pages.length === 0}
                loading={saving}
                leadingIcon={
                  !saving ? <Download className="h-4 w-4" /> : undefined
                }
              >
                {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Download PDF'}
              </Button>
            </div>
          </div>
        )}

        {/* Page grid */}
        {pages.length > 0 && !error && (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            }}
          >
            {pages.map((page, index) => {
              const isSelected = selectedKeys.has(page.key);
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={page.key}
                  draggable={!loading && !saving}
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver(index)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => toggleSelect(page.key, e.shiftKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSelect(page.key, e.shiftKey);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`Page ${index + 1}${isSelected ? ' (selected)' : ''}`}
                  className="flex cursor-pointer flex-col gap-1.5 transition-all duration-100"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--accent-subtle)'
                      : 'var(--bg-secondary)',
                    border: `2px solid ${
                      isDragOver
                        ? 'var(--accent)'
                        : isSelected
                          ? 'var(--accent)'
                          : 'var(--border-primary)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-sm)',
                      minHeight: '120px',
                      aspectRatio: '3/4',
                    }}
                  >
                    {page.thumbnail ? (
                      <img
                        src={page.thumbnail}
                        alt={`Page ${index + 1}`}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          transform: page.rotation !== 0
                            ? `rotate(${page.rotation}deg)`
                            : undefined,
                          transition: 'transform 200ms ease',
                        }}
                        draggable={false}
                      />
                    ) : (
                      <Loader2
                        className="h-5 w-5 tb-anim-spin"
                        style={{ color: 'var(--text-muted)' }}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Page info */}
                  <div className="flex items-center justify-between px-0.5">
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)',
                      }}
                    >
                      {index + 1}
                    </span>
                    {page.rotation !== 0 && (
                      <span
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {page.rotation}&deg;
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Hint text */}
        {pages.length > 0 && !error && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Click to select, Shift+click for range. Drag to reorder.
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
              <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No PDF loaded
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Upload a PDF to rotate, delete, or reorder its pages.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfPages;
