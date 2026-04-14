import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

interface PlaceholderDefaults {
  bgColor: string;
  textColor: string;
}

const DEFAULTS: PlaceholderDefaults = {
  bgColor: '#cccccc',
  textColor: '#555555',
};

const sanitizeDefaults = (raw: unknown): PlaceholderDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const isValidHex = (v: unknown): v is string =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  return {
    bgColor: isValidHex(obj.bgColor) ? obj.bgColor : DEFAULTS.bgColor,
    textColor: isValidHex(obj.textColor) ? obj.textColor : DEFAULTS.textColor,
  };
};

// ─── Presets ───────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  w: number;
  h: number;
}

const PRESETS: Preset[] = [
  { label: 'Instagram (1080x1080)', w: 1080, h: 1080 },
  { label: 'OG Image (1200x630)', w: 1200, h: 630 },
  { label: 'YouTube (1280x720)', w: 1280, h: 720 },
  { label: 'Blog (800x600)', w: 800, h: 600 },
  { label: 'Twitter Header (1500x500)', w: 1500, h: 500 },
  { label: 'Favicon (64x64)', w: 64, h: 64 },
];

// Clamp dimensions to prevent absurd canvas sizes that could hang the browser.
const MAX_DIMENSION = 4096;
const MIN_DIMENSION = 1;

const clampDim = (v: number): number =>
  Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(v)));

// ─── Component ─────────────────────────────────────────────────────────────

function PlaceholderImage() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [widthStr, setWidthStr] = useState('800');
  const [heightStr, setHeightStr] = useState('600');
  const [bgColor, setBgColor] = useState(initial.bgColor);
  const [textColor, setTextColor] = useState(initial.textColor);
  const [text, setText] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const debouncedWidth = useDebounce(widthStr, 200);
  const debouncedHeight = useDebounce(heightStr, 200);
  const debouncedBgColor = useDebounce(bgColor, 200);
  const debouncedTextColor = useDebounce(textColor, 200);
  const debouncedText = useDebounce(text, 200);

  // Parse dimensions
  const width = useMemo(() => {
    const v = Number.parseInt(debouncedWidth, 10);
    return Number.isFinite(v) && v > 0 ? clampDim(v) : 0;
  }, [debouncedWidth]);

  const height = useMemo(() => {
    const v = Number.parseInt(debouncedHeight, 10);
    return Number.isFinite(v) && v > 0 ? clampDim(v) : 0;
  }, [debouncedHeight]);

  const displayText = debouncedText || (width > 0 && height > 0 ? `${width}x${height}` : '');

  // Persist colors after mount
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { bgColor, textColor } satisfies PlaceholderDefaults,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgColor, textColor]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = debouncedBgColor;
    ctx.fillRect(0, 0, width, height);

    // Text
    if (displayText) {
      // Scale font to roughly 1/10th of the smaller dimension, clamped
      const fontSize = Math.max(12, Math.min(120, Math.floor(Math.min(width, height) / 8)));
      ctx.fillStyle = debouncedTextColor;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate if the text is wider than the canvas
      const measured = ctx.measureText(displayText);
      if (measured.width > width * 0.9) {
        // Reduce font size proportionally
        const scaledSize = Math.floor(fontSize * (width * 0.9) / measured.width);
        ctx.font = `bold ${Math.max(10, scaledSize)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      }

      ctx.fillText(displayText, width / 2, height / 2);
    }
  }, [width, height, debouncedBgColor, debouncedTextColor, displayText]);

  // Download as PNG
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `placeholder-${width}x${height}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      showToast('Could not download image', 'error');
    }
  }, [width, height, showToast]);

  // Apply preset
  const handlePreset = useCallback((preset: Preset) => {
    setWidthStr(String(preset.w));
    setHeightStr(String(preset.h));
  }, []);

  const isValid = width > 0 && height > 0;

  // Scale preview to fit within a max visual size
  const previewScale = isValid
    ? Math.min(1, 400 / Math.max(width, height))
    : 1;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Presets */}
        <div className="flex flex-col gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Presets
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handlePreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div
          className="flex flex-wrap items-end gap-4 p-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="w-28">
            <Input
              label="Width (px)"
              type="number"
              inputMode="numeric"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={widthStr}
              onChange={(e) => setWidthStr(e.target.value)}
              placeholder="800"
              aria-label="Image width in pixels"
            />
          </div>
          <div className="w-28">
            <Input
              label="Height (px)"
              type="number"
              inputMode="numeric"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={heightStr}
              onChange={(e) => setHeightStr(e.target.value)}
              placeholder="600"
              aria-label="Image height in pixels"
            />
          </div>

          {/* Color pickers with hex input */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Background
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                aria-label="Background color picker"
                className="h-9 w-9 cursor-pointer border-0 p-0"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                }}
              />
              <div className="w-24">
                <Input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBgColor(v);
                  }}
                  placeholder="#cccccc"
                  aria-label="Background color hex"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Text Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                aria-label="Text color picker"
                className="h-9 w-9 cursor-pointer border-0 p-0"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                }}
              />
              <div className="w-24">
                <Input
                  type="text"
                  value={textColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTextColor(v);
                  }}
                  placeholder="#555555"
                  aria-label="Text color hex"
                />
              </div>
            </div>
          </div>

          <div className="w-48">
            <Input
              label="Custom Text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder={isValid ? `${width}x${height}` : 'WxH'}
              aria-label="Custom text overlay"
            />
          </div>
        </div>

        {/* Preview */}
        {isValid ? (
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-center overflow-hidden p-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                minHeight: '200px',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: `${Math.round(width * previewScale)}px`,
                  height: `${Math.round(height * previewScale)}px`,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-secondary)',
                }}
                aria-label={`Placeholder image preview ${width}x${height}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {width} x {height} px
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                leadingIcon={<Download className="h-4 w-4" />}
              >
                Download PNG
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-[200px] items-center justify-center p-4 text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-tertiary)',
            }}
          >
            Enter valid width and height to see a preview.
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default PlaceholderImage;
