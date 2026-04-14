import { useCallback, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { triggerDownload } from '@/tools/pdf-shared/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type WatermarkPosition = 'center' | 'diagonal';
type WatermarkRotation = '0' | '45' | '90';

interface PdfInfo {
  file: File;
  buffer: ArrayBuffer;
  pageCount: number;
  name: string;
  size: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POSITION_OPTIONS = [
  { value: 'center', label: 'Center' },
  { value: 'diagonal', label: 'Diagonal' },
];

const ROTATION_OPTIONS = [
  { value: '0', label: '0 degrees' },
  { value: '45', label: '45 degrees' },
  { value: '90', label: '90 degrees' },
];

const DEFAULT_TEXT = 'CONFIDENTIAL';
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_OPACITY = 0.3;
const DEFAULT_COLOR = '#888888';
const DEFAULT_ROTATION: WatermarkRotation = '0';
const DEFAULT_POSITION: WatermarkPosition = 'center';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a hex color (#RRGGBB or #RGB) to [0-1, 0-1, 0-1] for pdf-lib rgb(). */
function hexToRgbFloats(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [0.5, 0.5, 0.5]; // fallback gray
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/** Compute the effective rotation for a given position + rotation combo. */
function getEffectiveRotation(
  position: WatermarkPosition,
  rotation: WatermarkRotation,
): number {
  if (position === 'diagonal') return 45;
  return parseInt(rotation, 10);
}

// ─── Component ──────────────────────────────────────────────────────────────

function PdfWatermark() {
  const showToast = useAppStore((s) => s.showToast);

  // File state
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Watermark settings
  const [text, setText] = useState(DEFAULT_TEXT);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [rotation, setRotation] = useState<WatermarkRotation>(DEFAULT_ROTATION);
  const [position, setPosition] = useState<WatermarkPosition>(DEFAULT_POSITION);

  // ─── File handling ──────────────────────────────────────────────────────

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        showToast(`"${file.name}" is not a PDF file.`, 'warning');
        return;
      }

      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pageCount = pdf.getPageCount();

        setPdfInfo({
          file,
          buffer,
          pageCount,
          name: file.name,
          size: file.size,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isEncrypted =
          msg.toLowerCase().includes('encrypt') ||
          msg.toLowerCase().includes('password');
        showToast(
          isEncrypted
            ? `"${file.name}" is password-protected.`
            : `Could not load "${file.name}". It may be corrupted.`,
          'error',
        );
        setPdfInfo(null);
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  const handleClear = useCallback(() => {
    setPdfInfo(null);
  }, []);

  // ─── Watermark application ─────────────────────────────────────────────

  const handleApplyWatermark = useCallback(async () => {
    if (!pdfInfo) return;

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      showToast('Please enter watermark text.', 'warning');
      return;
    }

    setProcessing(true);
    try {
      const pdf = await PDFDocument.load(pdfInfo.buffer, {
        ignoreEncryption: true,
      });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const [r, g, b] = hexToRgbFloats(color);
      const effectiveRotation = getEffectiveRotation(position, rotation);
      const textWidth = font.widthOfTextAtSize(trimmedText, fontSize);
      const textHeight = fontSize;

      const pages = pdf.getPages();
      for (const page of pages) {
        const { width, height } = page.getSize();

        // Compute position: center the text on the page
        const x = (width - textWidth) / 2;
        const y = (height - textHeight) / 2;

        page.drawText(trimmedText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          opacity,
          rotate: degrees(effectiveRotation),
        });
      }

      const resultBytes = await pdf.save();
      const outputName = pdfInfo.name.replace(/\.pdf$/i, '') + '_watermarked.pdf';
      triggerDownload(resultBytes, outputName);

      showToast(
        `Watermark applied to ${pages.length} page${pages.length !== 1 ? 's' : ''}.`,
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Watermark failed: ${msg}`, 'error');
    } finally {
      setProcessing(false);
    }
  }, [pdfInfo, text, fontSize, color, opacity, rotation, position, showToast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Drop zone */}
        <FileDropZone
          onDrop={handleFileDrop}
          accept={['.pdf', 'application/pdf']}
          multiple={false}
          label="Drop a PDF here or click to browse"
          description={
            pdfInfo ? (
              <span>
                Current file: <strong>{pdfInfo.name}</strong>
              </span>
            ) : (
              'Select a PDF file to add a watermark'
            )
          }
        />

        {/* Loading indicator */}
        {loading && (
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Loader2
              className="h-4 w-4 tb-anim-spin"
              style={{ color: 'var(--accent)' }}
              aria-hidden="true"
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Loading PDF...
            </span>
          </div>
        )}

        {/* File info + controls */}
        {pdfInfo && !loading && (
          <>
            {/* File info strip */}
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                File
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {pdfInfo.name}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Pages
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {pdfInfo.pageCount}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Size
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {formatBytes(pdfInfo.size)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={processing}
                className="ml-auto"
              >
                Remove
              </Button>
            </div>

            {/* Watermark settings */}
            <div
              className="flex flex-col gap-4 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Watermark Settings
              </span>

              {/* Text */}
              <Input
                label="Watermark Text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter watermark text"
                aria-label="Watermark text"
              />

              {/* Row: Font size + Color + Opacity */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex flex-col gap-1.5 sm:w-1/3">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                    htmlFor="wm-font-size"
                  >
                    Font Size ({fontSize}px)
                  </label>
                  <input
                    id="wm-font-size"
                    type="range"
                    min={12}
                    max={72}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                    aria-label="Font size"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:w-1/3">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                    htmlFor="wm-color"
                  >
                    Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="wm-color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-9 w-9 cursor-pointer rounded border-none"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-md)',
                      }}
                      aria-label="Watermark color"
                    />
                    <Input
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="#888888"
                      aria-label="Watermark color hex"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:w-1/3">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                    htmlFor="wm-opacity"
                  >
                    Opacity ({Math.round(opacity * 100)}%)
                  </label>
                  <input
                    id="wm-opacity"
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full"
                    aria-label="Watermark opacity"
                  />
                </div>
              </div>

              {/* Row: Position + Rotation */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="sm:w-1/2">
                  <Select
                    label="Position"
                    options={POSITION_OPTIONS}
                    value={position}
                    onChange={(e) =>
                      setPosition(e.target.value as WatermarkPosition)
                    }
                    aria-label="Watermark position"
                  />
                </div>
                <div className="sm:w-1/2">
                  <Select
                    label="Rotation"
                    options={ROTATION_OPTIONS}
                    value={rotation}
                    onChange={(e) =>
                      setRotation(e.target.value as WatermarkRotation)
                    }
                    disabled={position === 'diagonal'}
                    aria-label="Watermark rotation"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleApplyWatermark}
                disabled={processing || text.trim().length === 0}
                loading={processing}
                leadingIcon={
                  !processing ? <Download className="h-4 w-4" /> : undefined
                }
              >
                {processing ? 'Applying...' : 'Apply Watermark & Download'}
              </Button>
            </div>
          </>
        )}

        {/* Empty state */}
        {!pdfInfo && !loading && (
          <div
            className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex flex-col gap-1">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                No PDF loaded
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Drop a PDF above to add a text watermark to every page.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PdfWatermark;
