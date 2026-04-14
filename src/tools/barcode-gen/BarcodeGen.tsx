import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type BarcodeFormat = 'CODE128' | 'UPC' | 'EAN13' | 'EAN8' | 'CODE39' | 'ITF14';

interface FormatInfo {
  label: string;
  placeholder: string;
  validate: (v: string) => boolean;
  hint: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FORMAT_INFO: Record<BarcodeFormat, FormatInfo> = {
  CODE128: {
    label: 'CODE128',
    placeholder: 'Hello World 123',
    validate: (v) => v.length > 0 && v.length <= 200,
    hint: 'Any ASCII text (up to 200 characters)',
  },
  UPC: {
    label: 'UPC-A',
    placeholder: '012345678905',
    validate: (v) => /^\d{11,12}$/.test(v),
    hint: '11 or 12 digits',
  },
  EAN13: {
    label: 'EAN-13',
    placeholder: '5901234123457',
    validate: (v) => /^\d{12,13}$/.test(v),
    hint: '12 or 13 digits',
  },
  EAN8: {
    label: 'EAN-8',
    placeholder: '96385074',
    validate: (v) => /^\d{7,8}$/.test(v),
    hint: '7 or 8 digits',
  },
  CODE39: {
    label: 'CODE39',
    placeholder: 'HELLO 123',
    validate: (v) => /^[A-Z0-9\-.$/+% ]+$/.test(v) && v.length > 0 && v.length <= 200,
    hint: 'Uppercase letters, digits, and - . $ / + % space',
  },
  ITF14: {
    label: 'ITF-14',
    placeholder: '15400141288763',
    validate: (v) => /^\d{13,14}$/.test(v),
    hint: '13 or 14 digits',
  },
};

const FORMAT_OPTIONS = (Object.keys(FORMAT_INFO) as BarcodeFormat[]).map((f) => ({
  value: f,
  label: FORMAT_INFO[f].label,
}));

/** Attempt to auto-detect the barcode format from the input. */
function autoDetectFormat(value: string): BarcodeFormat | null {
  const trimmed = value.trim();
  if (/^\d{7,8}$/.test(trimmed)) return 'EAN8';
  if (/^\d{11,12}$/.test(trimmed)) return 'UPC';
  if (/^\d{12,13}$/.test(trimmed)) return 'EAN13';
  if (/^\d{13,14}$/.test(trimmed)) return 'ITF14';
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

function BarcodeGen() {
  const showToast = useAppStore((s) => s.showToast);
  const svgRef = useRef<SVGSVGElement>(null);

  const [input, setInput] = useState('');
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [barWidth, setBarWidth] = useState(2);
  const [barHeight, setBarHeight] = useState(100);
  const [showText, setShowText] = useState(true);
  const [textFontSize, setTextFontSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);

  const debouncedInput = useDebounce(input, 200);

  // ─── Auto-detect format ─────────────────────────────────────────────────

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      const detected = autoDetectFormat(value);
      if (detected && detected !== format) {
        setFormat(detected);
        setAutoDetected(true);
      } else {
        setAutoDetected(false);
      }
    },
    [format],
  );

  // ─── Render barcode ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!svgRef.current) return;

    const trimmed = debouncedInput.trim();
    if (trimmed.length === 0) {
      // Clear the SVG
      while (svgRef.current.firstChild) {
        svgRef.current.removeChild(svgRef.current.firstChild);
      }
      setError(null);
      return;
    }

    const info = FORMAT_INFO[format];
    if (!info.validate(trimmed)) {
      setError(`Invalid input for ${info.label}. ${info.hint}.`);
      while (svgRef.current.firstChild) {
        svgRef.current.removeChild(svgRef.current.firstChild);
      }
      return;
    }

    try {
      JsBarcode(svgRef.current, trimmed, {
        format,
        width: barWidth,
        height: barHeight,
        displayValue: showText,
        fontSize: textFontSize,
        font: 'monospace',
        textMargin: 4,
        margin: 10,
        background: 'transparent',
        lineColor: 'currentColor',
        valid: (valid) => {
          if (!valid) {
            setError(`Could not encode "${trimmed}" as ${info.label}.`);
          }
        },
      });
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Encoding error: ${msg}`);
    }
  }, [debouncedInput, format, barWidth, barHeight, showText, textFontSize]);

  // ─── Download handlers ──────────────────────────────────────────────────

  const handleDownloadSvg = useCallback(() => {
    if (!svgRef.current || !svgRef.current.firstChild) {
      showToast('No barcode to download.', 'warning');
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${format.toLowerCase()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [format, showToast]);

  const handleDownloadPng = useCallback(() => {
    if (!svgRef.current || !svgRef.current.firstChild) {
      showToast('No barcode to download.', 'warning');
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRef.current);
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const scale = 2; // 2x for retina quality
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        showToast('Could not create canvas for PNG export.', 'error');
        URL.revokeObjectURL(svgUrl);
        return;
      }

      // White background for PNG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Could not generate PNG.', 'error');
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `barcode-${format.toLowerCase()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
        },
        'image/png',
      );
      URL.revokeObjectURL(svgUrl);
    };
    img.onerror = () => {
      showToast('Could not render SVG to image.', 'error');
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  }, [format, showToast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const hasBarcode =
    debouncedInput.trim().length > 0 && error === null;
  const info = FORMAT_INFO[format];

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Input */}
        <Input
          label="Value"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={info.placeholder}
          hint={
            autoDetected
              ? `Auto-detected: ${info.label}. ${info.hint}`
              : info.hint
          }
          aria-label="Barcode value"
        />

        {/* Settings */}
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
            Settings
          </span>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="sm:w-1/3">
              <Select
                label="Format"
                options={FORMAT_OPTIONS}
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as BarcodeFormat);
                  setAutoDetected(false);
                }}
                aria-label="Barcode format"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:w-1/3">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
                htmlFor="bc-bar-width"
              >
                Bar Width ({barWidth}px)
              </label>
              <input
                id="bc-bar-width"
                type="range"
                min={1}
                max={5}
                step={1}
                value={barWidth}
                onChange={(e) => setBarWidth(Number(e.target.value))}
                className="w-full"
                aria-label="Bar width"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:w-1/3">
              <label
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
                htmlFor="bc-bar-height"
              >
                Height ({barHeight}px)
              </label>
              <input
                id="bc-bar-height"
                type="range"
                min={40}
                max={200}
                step={5}
                value={barHeight}
                onChange={(e) => setBarHeight(Number(e.target.value))}
                className="w-full"
                aria-label="Bar height"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Toggle
              checked={showText}
              onChange={setShowText}
              label="Show text below barcode"
            />
            {showText && (
              <div className="flex flex-col gap-1.5 sm:w-1/3">
                <label
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                  htmlFor="bc-font-size"
                >
                  Font Size ({textFontSize}px)
                </label>
                <input
                  id="bc-font-size"
                  type="range"
                  min={10}
                  max={36}
                  step={1}
                  value={textFontSize}
                  onChange={(e) => setTextFontSize(Number(e.target.value))}
                  className="w-full"
                  aria-label="Text font size"
                />
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-md)',
            }}
            role="alert"
          >
            <span
              className="text-xs"
              style={{ color: 'var(--danger)' }}
            >
              {error}
            </span>
          </div>
        )}

        {/* Barcode preview */}
        <div
          className="flex items-center justify-center overflow-auto p-4"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            minHeight: '160px',
            color: 'var(--text-primary)',
          }}
        >
          {debouncedInput.trim().length === 0 ? (
            <span
              className="text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Enter a value above to generate a barcode
            </span>
          ) : (
            <svg ref={svgRef} />
          )}
        </div>

        {/* Download buttons */}
        {hasBarcode && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleDownloadPng}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              Download PNG
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleDownloadSvg}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              Download SVG
            </Button>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default BarcodeGen;
