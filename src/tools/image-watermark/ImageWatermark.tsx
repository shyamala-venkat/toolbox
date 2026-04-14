import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ACCEPT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

type PositionId =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

const POSITIONS: { value: PositionId; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'middle-left', label: 'Middle Left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Middle Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

const POSITION_LABELS: Record<PositionId, string> = {
  'top-left': 'TL',
  'top-center': 'TC',
  'top-right': 'TR',
  'middle-left': 'ML',
  center: 'C',
  'middle-right': 'MR',
  'bottom-left': 'BL',
  'bottom-center': 'BC',
  'bottom-right': 'BR',
};

interface WatermarkDefaults {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  position: PositionId;
  angle: number;
}

const DEFAULTS: WatermarkDefaults = {
  text: 'WATERMARK',
  fontSize: 48,
  color: '#ffffff',
  opacity: 50,
  position: 'center',
  angle: -30,
};

// ─── Persistence ────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

const isValidPosition = (v: unknown): v is PositionId =>
  typeof v === 'string' && POSITIONS.some((p) => p.value === v);

const sanitizeDefaults = (raw: unknown): WatermarkDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    text: typeof obj.text === 'string' ? obj.text.slice(0, 200) : DEFAULTS.text,
    fontSize:
      typeof obj.fontSize === 'number'
        ? clamp(Math.round(obj.fontSize), 12, 120)
        : DEFAULTS.fontSize,
    color: typeof obj.color === 'string' ? obj.color : DEFAULTS.color,
    opacity:
      typeof obj.opacity === 'number'
        ? clamp(Math.round(obj.opacity), 0, 100)
        : DEFAULTS.opacity,
    position: isValidPosition(obj.position) ? obj.position : DEFAULTS.position,
    angle:
      typeof obj.angle === 'number'
        ? clamp(Math.round(obj.angle), -180, 180)
        : DEFAULTS.angle,
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get x, y anchor for a position on the image. */
const getPositionCoords = (
  pos: PositionId,
  imgW: number,
  imgH: number,
  margin: number,
): { x: number; y: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline } => {
  const m = margin;
  switch (pos) {
    case 'top-left':
      return { x: m, y: m, textAlign: 'left', textBaseline: 'top' };
    case 'top-center':
      return { x: imgW / 2, y: m, textAlign: 'center', textBaseline: 'top' };
    case 'top-right':
      return { x: imgW - m, y: m, textAlign: 'right', textBaseline: 'top' };
    case 'middle-left':
      return { x: m, y: imgH / 2, textAlign: 'left', textBaseline: 'middle' };
    case 'center':
      return { x: imgW / 2, y: imgH / 2, textAlign: 'center', textBaseline: 'middle' };
    case 'middle-right':
      return { x: imgW - m, y: imgH / 2, textAlign: 'right', textBaseline: 'middle' };
    case 'bottom-left':
      return { x: m, y: imgH - m, textAlign: 'left', textBaseline: 'bottom' };
    case 'bottom-center':
      return { x: imgW / 2, y: imgH - m, textAlign: 'center', textBaseline: 'bottom' };
    case 'bottom-right':
      return { x: imgW - m, y: imgH - m, textAlign: 'right', textBaseline: 'bottom' };
  }
};

const triggerDownload = (href: string, filename: string): void => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// ─── Component ──────────────────────────────────────────────────────────────

function ImageWatermark() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = sanitizeDefaults(stored);

  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  const [text, setText] = useState(initial.text);
  const [fontSize, setFontSize] = useState(initial.fontSize);
  const [color, setColor] = useState(initial.color);
  const [opacity, setOpacity] = useState(initial.opacity);
  const [position, setPosition] = useState<PositionId>(initial.position);
  const [angle, setAngle] = useState(initial.angle);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const debouncedText = useDebounce(text, 200);
  const debouncedFontSize = useDebounce(fontSize, 150);
  const debouncedAngle = useDebounce(angle, 150);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Persist defaults ─────────────────────────────────────────────────

  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    update({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { text, fontSize, color, opacity, position, angle },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fontSize, color, opacity, position, angle]);

  // ─── Image loading ──────────────────────────────────────────────────────

  const handleFileDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (file.size > MAX_IMAGE_SIZE) {
        showToast('Image is larger than 10 MB. Processing may be slow.', 'warning');
      }

      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageData(reader.result as string);
        setImageName(file.name.replace(/\.[^.]+$/, ''));
      };
      reader.onerror = () => showToast('Failed to read image file.', 'error');
      reader.readAsDataURL(file);
    },
    [showToast, resultUrl],
  );

  useEffect(() => {
    if (!imageData) {
      setImageEl(null);
      return;
    }

    const img = new Image();
    img.onload = () => setImageEl(img);
    img.onerror = () => {
      showToast('Failed to decode image.', 'error');
      setImageData(null);
    };
    img.src = imageData;
  }, [imageData, showToast]);

  // ─── Draw preview with watermark ──────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageEl) return;

    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;

    const rect = container.getBoundingClientRect();
    const maxW = rect.width;
    const maxH = 500;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    const cw = Math.round(imgW * scale);
    const ch = Math.round(imgH * scale);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Draw image
    ctx.drawImage(imageEl, 0, 0, cw, ch);

    // Draw watermark
    if (debouncedText.trim().length > 0) {
      const scaledFontSize = debouncedFontSize * scale;
      const margin = scaledFontSize;

      ctx.save();
      ctx.globalAlpha = opacity / 100;
      ctx.fillStyle = color;
      ctx.font = `bold ${scaledFontSize}px sans-serif`;

      const { x, y, textAlign, textBaseline } = getPositionCoords(
        position,
        cw,
        ch,
        margin,
      );

      ctx.translate(x, y);
      ctx.rotate((debouncedAngle * Math.PI) / 180);
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      ctx.fillText(debouncedText, 0, 0);
      ctx.restore();
    }
  }, [imageEl, debouncedText, debouncedFontSize, color, opacity, position, debouncedAngle]);

  // ─── Download ─────────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!imageEl) return;

    try {
      const imgW = imageEl.naturalWidth;
      const imgH = imageEl.naturalHeight;

      const offscreen = document.createElement('canvas');
      offscreen.width = imgW;
      offscreen.height = imgH;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        showToast('Canvas context unavailable.', 'error');
        return;
      }

      // Draw full-resolution image
      ctx.drawImage(imageEl, 0, 0, imgW, imgH);

      // Draw watermark at full resolution
      if (text.trim().length > 0) {
        const margin = fontSize;

        ctx.save();
        ctx.globalAlpha = opacity / 100;
        ctx.fillStyle = color;
        ctx.font = `bold ${fontSize}px sans-serif`;

        const { x, y, textAlign, textBaseline } = getPositionCoords(
          position,
          imgW,
          imgH,
          margin,
        );

        ctx.translate(x, y);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      offscreen.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Failed to generate image.', 'error');
            return;
          }
          if (resultUrl) URL.revokeObjectURL(resultUrl);
          const url = URL.createObjectURL(blob);
          setResultUrl(url);
          triggerDownload(url, `${imageName || 'image'}-watermarked.png`);
          showToast('Watermarked image downloaded.', 'success');
        },
        'image/png',
      );
    } catch {
      showToast('Failed to process image.', 'error');
    }
  }, [imageEl, text, fontSize, color, opacity, position, angle, imageName, resultUrl, showToast]);

  const handleChangeImage = useCallback(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setImageData(null);
    setImageEl(null);
    setImageName('');
  }, [resultUrl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!imageEl ? (
          <FileDropZone
            onDrop={handleFileDrop}
            accept={ACCEPT}
            multiple={false}
            label="Drop an image to watermark"
            description="Supports PNG, JPEG, WebP, BMP, GIF"
          />
        ) : (
          <>
            {/* Watermark controls */}
            <div
              className="flex flex-col gap-4 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {/* Text input */}
              <Input
                label="Watermark text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 200))}
                placeholder="Enter watermark text..."
                aria-label="Watermark text"
              />

              {/* Controls row */}
              <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
                {/* Font size */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Font size
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={12}
                      max={120}
                      step={1}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="tb-range w-28"
                      aria-label="Font size"
                    />
                    <span
                      className="w-8 text-right text-xs font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {fontSize}
                    </span>
                  </div>
                </div>

                {/* Color */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Color
                  </label>
                  <div
                    className="flex h-9 items-center gap-2 px-2"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                      aria-label="Watermark color"
                    />
                    <span
                      className="text-xs font-mono"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {color.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Opacity */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Opacity
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="tb-range w-28"
                      aria-label="Opacity"
                    />
                    <span
                      className="w-10 text-right text-xs font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {opacity}%
                    </span>
                  </div>
                </div>

                {/* Rotation */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Rotation
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={angle}
                      onChange={(e) => setAngle(Number(e.target.value))}
                      className="tb-range w-28"
                      aria-label="Rotation angle"
                    />
                    <span
                      className="w-10 text-right text-xs font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {angle}°
                    </span>
                  </div>
                </div>
              </div>

              {/* Position grid */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Position
                </label>
                <div
                  className="inline-grid gap-1"
                  style={{
                    gridTemplateColumns: 'repeat(3, 40px)',
                    gridTemplateRows: 'repeat(3, 32px)',
                  }}
                >
                  {POSITIONS.map((p) => {
                    const isActive = position === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPosition(p.value)}
                        className="flex items-center justify-center text-[10px] font-medium transition-colors duration-150"
                        style={{
                          backgroundColor: isActive
                            ? 'var(--accent-subtle)'
                            : 'var(--bg-tertiary)',
                          color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                          border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-primary)'}`,
                          borderRadius: 'var(--radius-sm)',
                        }}
                        aria-label={p.label}
                        aria-pressed={isActive}
                        title={p.label}
                      >
                        {POSITION_LABELS[p.value]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Canvas preview */}
            <div
              ref={containerRef}
              className="flex items-center justify-center overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                minHeight: '200px',
                padding: '0.5rem',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ display: 'block' }}
                aria-label="Watermarked image preview"
                role="img"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleDownload}
                disabled={text.trim().length === 0}
                leadingIcon={<Download className="h-4 w-4" />}
              >
                Download PNG
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleChangeImage}
              >
                Change image
              </Button>
            </div>
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageWatermark;
