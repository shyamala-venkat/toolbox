import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { parsePageRange, triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type OutputFormat = 'png' | 'jpg';
type RenderScale = '1' | '2' | '3';
type PageSelection = 'all' | 'range';

interface PagePreview {
  pageNum: number;
  dataUrl: string;
}

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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Component ──────────────────────────────────────────────────────────────

function PdfToImage() {
  const showToast = useAppStore((s) => s.showToast);

  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [format, setFormat] = useState<OutputFormat>('png');
  const [scale, setScale] = useState<RenderScale>('2');
  const [pageSelection, setPageSelection] = useState<PageSelection>('all');
  const [rangeInput, setRangeInput] = useState('');

  const [previews, setPreviews] = useState<PagePreview[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');
  const [downloading, setDownloading] = useState(false);

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
      setPageCount(0);
      setBuffer(null);
      setPreviews([]);

      try {
        const buf = await f.arrayBuffer();
        const pdfjsLib = await getPdfjs();
        // Pass a copy — pdfjs transfers the buffer to its web worker, detaching
        // the original. We need to keep `buf` intact for subsequent renders.
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        setPageCount(pdf.numPages);
        setBuffer(buf);
        pdf.destroy();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        showToast(`Could not load PDF: ${msg}`, 'error');
      }
    },
    [showToast],
  );

  // ─── Rendering ──────────────────────────────────────────────────────────

  const targetPages: number[] | null = (() => {
    if (pageCount === 0) return null;
    if (pageSelection === 'all') {
      return Array.from({ length: pageCount }, (_, i) => i + 1);
    }
    if (!rangeInput.trim()) return null;
    const parsed = parsePageRange(rangeInput, pageCount);
    if (!parsed) return null;
    return parsed.map((p) => p + 1); // convert to 1-indexed
  })();

  const rangeError = (() => {
    if (pageSelection !== 'range' || !rangeInput.trim() || pageCount === 0) return null;
    const parsed = parsePageRange(rangeInput, pageCount);
    if (!parsed) return `Invalid range. Use pages 1-${pageCount} (e.g. "1-3, 5").`;
    return null;
  })();

  // Auto-render previews when file loaded + settings valid
  useEffect(() => {
    if (!buffer || !targetPages || targetPages.length === 0) {
      setPreviews([]);
      return;
    }

    const myEpoch = ++epochRef.current;
    setRendering(true);
    setPreviews([]);

    const render = async () => {
      try {
        const pdfjsLib = await getPdfjs();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
        const scaleNum = parseFloat(scale);
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const results: PagePreview[] = [];

        // Render thumbnails at lower scale for preview, full scale on download
        const previewScale = Math.min(scaleNum, 1);

        for (let i = 0; i < targetPages.length; i++) {
          if (epochRef.current !== myEpoch) {
            pdf.destroy();
            return;
          }
          const pageNum = targetPages[i]!;
          setRenderProgress(`Rendering page ${pageNum} (${i + 1}/${targetPages.length})...`);

          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: previewScale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            page.cleanup();
            continue;
          }
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl =
            format === 'jpg'
              ? canvas.toDataURL(mimeType, 0.92)
              : canvas.toDataURL(mimeType);
          results.push({ pageNum, dataUrl });
          page.cleanup();
        }

        pdf.destroy();
        if (epochRef.current === myEpoch) {
          setPreviews(results);
        }
      } catch (err) {
        if (epochRef.current === myEpoch) {
          const msg = err instanceof Error ? err.message : String(err);
          showToast(`Render failed: ${msg}`, 'error');
        }
      } finally {
        if (epochRef.current === myEpoch) {
          setRendering(false);
          setRenderProgress('');
        }
      }
    };

    void render();

    return () => {
      epochRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, format, scale, pageSelection, rangeInput, pageCount]);

  // ─── Download single page ──────────────────────────────────────────────

  const downloadSinglePage = useCallback(
    async (pageNum: number) => {
      if (!buffer) return;
      try {
        const pdfjsLib = await getPdfjs();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
        const page = await pdf.getPage(pageNum);
        const scaleNum = parseFloat(scale);
        const viewport = page.getViewport({ scale: scaleNum });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const dataUrl =
          format === 'jpg'
            ? canvas.toDataURL(mimeType, 0.92)
            : canvas.toDataURL(mimeType);
        page.cleanup();
        pdf.destroy();

        const ext = format === 'jpg' ? 'jpg' : 'png';
        const stem = (file?.name ?? 'page').replace(/\.pdf$/i, '');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${stem}_page${pageNum}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Download failed: ${msg}`, 'error');
      }
    },
    [buffer, format, scale, file, showToast],
  );

  // ─── Download all ─────────────────────────────────────────────────────

  const downloadAll = useCallback(async () => {
    if (!buffer || !targetPages || targetPages.length === 0) return;
    setDownloading(true);

    try {
      const pdfjsLib = await getPdfjs();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
      const scaleNum = parseFloat(scale);
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const ext = format === 'jpg' ? 'jpg' : 'png';
      const stem = (file?.name ?? 'pages').replace(/\.pdf$/i, '');

      if (targetPages.length === 1) {
        // Single page: download directly
        const pageNum = targetPages[0]!;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: scaleNum });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl =
          format === 'jpg'
            ? canvas.toDataURL(mimeType, 0.92)
            : canvas.toDataURL(mimeType);
        page.cleanup();
        pdf.destroy();

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${stem}_page${pageNum}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Image downloaded.', 'success');
        return;
      }

      // Multiple pages: ZIP
      const zipEntries: Record<string, Uint8Array> = {};
      for (const pageNum of targetPages) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: scaleNum });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          page.cleanup();
          continue;
        }
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl =
          format === 'jpg'
            ? canvas.toDataURL(mimeType, 0.92)
            : canvas.toDataURL(mimeType);
        zipEntries[`${stem}_page${pageNum}.${ext}`] = dataUrlToBytes(dataUrl);
        page.cleanup();
      }

      pdf.destroy();
      const zipped = zipSync(zipEntries, { level: 0 });
      triggerDownload(
        new Blob([zipped], { type: 'application/zip' }),
        `${stem}_images.zip`,
      );
      showToast(`${targetPages.length} images zipped and downloaded.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Download failed: ${msg}`, 'error');
    } finally {
      setDownloading(false);
    }
  }, [buffer, targetPages, format, scale, file, showToast]);

  const handleClear = useCallback(() => {
    epochRef.current++;
    setFile(null);
    setBuffer(null);
    setPageCount(0);
    setError(null);
    setPreviews([]);
    setRangeInput('');
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
            description="Select a PDF to convert pages to images."
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
              disabled={rendering || downloading}
            >
              Change file
            </Button>
          </div>
        )}

        {/* Options */}
        {pageCount > 0 && !error && (
          <div
            className="flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="w-36">
              <Select
                label="Format"
                value={format}
                onChange={(e) => setFormat(e.target.value as OutputFormat)}
                options={[
                  { value: 'png', label: 'PNG' },
                  { value: 'jpg', label: 'JPG' },
                ]}
              />
            </div>
            <div className="w-36">
              <Select
                label="Scale"
                value={scale}
                onChange={(e) => setScale(e.target.value as RenderScale)}
                options={[
                  { value: '1', label: '1x (72 dpi)' },
                  { value: '2', label: '2x (144 dpi)' },
                  { value: '3', label: '3x (216 dpi)' },
                ]}
              />
            </div>
            <div className="w-40">
              <Select
                label="Pages"
                value={pageSelection}
                onChange={(e) => setPageSelection(e.target.value as PageSelection)}
                options={[
                  { value: 'all', label: 'All pages' },
                  { value: 'range', label: 'Custom range' },
                ]}
              />
            </div>
            {pageSelection === 'range' && (
              <div className="w-56">
                <Input
                  label="Page range"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder="e.g. 1-3, 5"
                  error={rangeError ?? undefined}
                  hint={`Pages 1 to ${pageCount}`}
                />
              </div>
            )}
          </div>
        )}

        {/* Rendering indicator */}
        {rendering && (
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ color: 'var(--text-tertiary)' }}
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 tb-anim-spin" aria-hidden="true" />
            <span className="text-xs">{renderProgress || 'Rendering...'}</span>
          </div>
        )}

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {previews.length} page{previews.length !== 1 ? 's' : ''} rendered
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={downloadAll}
                disabled={downloading}
                loading={downloading}
                leadingIcon={
                  !downloading ? <Download className="h-4 w-4" /> : undefined
                }
              >
                {downloading
                  ? 'Downloading...'
                  : previews.length > 1
                    ? `Download All (ZIP)`
                    : 'Download'}
              </Button>
            </div>

            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              }}
            >
              {previews.map((p) => (
                <div
                  key={p.pageNum}
                  className="flex flex-col gap-2"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem',
                  }}
                >
                  <div
                    className="flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-sm)',
                      minHeight: '120px',
                    }}
                  >
                    <img
                      src={p.dataUrl}
                      alt={`Page ${p.pageNum}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Page {p.pageNum}
                    </span>
                    <button
                      type="button"
                      onClick={() => void downloadSinglePage(p.pageNum)}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors duration-100"
                      style={{ color: 'var(--accent)' }}
                      aria-label={`Download page ${p.pageNum}`}
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No PDF loaded
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Upload a PDF to convert its pages to images.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfToImage;
