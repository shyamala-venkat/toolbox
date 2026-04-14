import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Globe } from 'lucide-react';
import { zipSync } from 'fflate';
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
const ACCEPT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg'];

const FAVICON_SIZES = [
  { size: 16, name: 'favicon-16x16.png', label: '16x16' },
  { size: 32, name: 'favicon-32x32.png', label: '32x32' },
  { size: 48, name: 'favicon-48x48.png', label: '48x48' },
  { size: 180, name: 'apple-touch-icon.png', label: '180x180 (Apple)' },
  { size: 192, name: 'android-chrome-192x192.png', label: '192x192 (Android)' },
] as const;

type InputMode = 'text' | 'image';

interface FaviconDefaults {
  text: string;
  bgColor: string;
  textColor: string;
}

const DEFAULTS: FaviconDefaults = {
  text: 'A',
  bgColor: '#4f46e5',
  textColor: '#ffffff',
};

// ─── Persistence ────────────────────────────────────────────────────────────

const sanitizeDefaults = (raw: unknown): FaviconDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    text: typeof obj.text === 'string' ? obj.text.slice(0, 4) : DEFAULTS.text,
    bgColor: typeof obj.bgColor === 'string' ? obj.bgColor : DEFAULTS.bgColor,
    textColor: typeof obj.textColor === 'string' ? obj.textColor : DEFAULTS.textColor,
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const triggerDownload = (href: string, filename: string): void => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/** Render text/emoji onto a canvas at a given size, return the canvas. */
const renderTextFavicon = (
  text: string,
  size: number,
  bgColor: string,
  textColor: string,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Text
  const fontSize = text.length <= 2 ? size * 0.55 : size * 0.4;
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.03); // slight offset for visual centering

  return canvas;
};

/** Resize an image onto a canvas at a given size. */
const renderImageFavicon = (
  img: HTMLImageElement,
  size: number,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Scale and center-crop to square
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const scale = Math.max(size / srcW, size / srcH);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return canvas;
};

/** Convert a canvas to a Uint8Array (PNG bytes). Returns null on failure. */
const canvasToPngBytes = (canvas: HTMLCanvasElement): Promise<Uint8Array | null> => {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then(
          (buf) => resolve(new Uint8Array(buf)),
          () => resolve(null),
        );
      },
      'image/png',
    );
  });
};

// ─── Component ──────────────────────────────────────────────────────────────

function FaviconGen() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateSettings = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []);

  const [mode, setMode] = useState<InputMode>('text');
  const [text, setText] = useState(initial.text);
  const [bgColor, setBgColor] = useState(initial.bgColor);
  const [textColor, setTextColor] = useState(initial.textColor);

  const [imageData, setImageData] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [zipping, setZipping] = useState(false);

  const debouncedText = useDebounce(text, 200);
  const previewRefs = useRef<Record<number, string>>({});

  // ─── Persist defaults ─────────────────────────────────────────────────

  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateSettings({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { text, bgColor, textColor },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, bgColor, textColor]);

  // ─── Image loading ──────────────────────────────────────────────────────

  const handleFileDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (file.size > MAX_IMAGE_SIZE) {
        showToast('Image is larger than 10 MB. Processing may be slow.', 'warning');
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageData(reader.result as string);
        setMode('image');
      };
      reader.onerror = () => showToast('Failed to read image file.', 'error');
      reader.readAsDataURL(file);
    },
    [showToast],
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

  // ─── Generate previews ────────────────────────────────────────────────

  useEffect(() => {
    // Clean up old previews
    for (const url of Object.values(previewRefs.current)) {
      URL.revokeObjectURL(url);
    }
    previewRefs.current = {};

    if (mode === 'text') {
      if (debouncedText.trim().length === 0) {
        setPreviews({});
        return;
      }

      const newPreviews: Record<number, string> = {};
      for (const { size } of FAVICON_SIZES) {
        const canvas = renderTextFavicon(debouncedText, size, bgColor, textColor);
        const url = canvas.toDataURL('image/png');
        newPreviews[size] = url;
      }
      setPreviews(newPreviews);
    } else if (mode === 'image' && imageEl) {
      const newPreviews: Record<number, string> = {};
      for (const { size } of FAVICON_SIZES) {
        const canvas = renderImageFavicon(imageEl, size);
        const url = canvas.toDataURL('image/png');
        newPreviews[size] = url;
      }
      setPreviews(newPreviews);
    } else {
      setPreviews({});
    }
  }, [mode, debouncedText, bgColor, textColor, imageEl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(previewRefs.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // ─── Download ZIP ─────────────────────────────────────────────────────

  const handleDownloadZip = useCallback(async () => {
    if (zipping) return;
    setZipping(true);

    try {
      const files: Record<string, Uint8Array> = {};

      for (const { size, name } of FAVICON_SIZES) {
        let canvas: HTMLCanvasElement;
        if (mode === 'text') {
          canvas = renderTextFavicon(text, size, bgColor, textColor);
        } else if (imageEl) {
          canvas = renderImageFavicon(imageEl, size);
        } else {
          continue;
        }

        const bytes = await canvasToPngBytes(canvas);
        if (bytes) {
          files[name] = bytes;
        }
      }

      if (Object.keys(files).length === 0) {
        showToast('No favicon images to download.', 'warning');
        return;
      }

      const zipped = zipSync(files, { level: 6 });
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, 'favicons.zip');
      // Delay revoke so the download can start
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('Favicon set downloaded as ZIP.', 'success');
    } catch {
      showToast('Failed to generate ZIP file.', 'error');
    } finally {
      setZipping(false);
    }
  }, [mode, text, bgColor, textColor, imageEl, zipping, showToast]);

  // ─── Render ───────────────────────────────────────────────────────────

  const hasContent =
    (mode === 'text' && text.trim().length > 0) ||
    (mode === 'image' && imageEl !== null);

  const hasPreviews = Object.keys(previews).length > 0;

  const modeTabs = (
    <div
      role="tablist"
      aria-label="Input mode"
      className="inline-flex p-0.5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {([
        { id: 'text' as const, label: 'Text / Emoji' },
        { id: 'image' as const, label: 'Upload Image' },
      ]).map((tab) => {
        const isActive = mode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setMode(tab.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-150"
            style={{
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const textInputs = (
    <div className="flex flex-col gap-4">
      <Input
        label="Text or emoji"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 4))}
        placeholder="A"
        aria-label="Favicon text or emoji"
        hint="Up to 4 characters. Single emoji or letter works best."
      />
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Background color
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
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Background color"
            />
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              {bgColor.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Text color
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
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Text color"
            />
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              {textColor.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const imageInput = (
    <div className="flex flex-col gap-3">
      {!imageEl ? (
        <FileDropZone
          onDrop={handleFileDrop}
          accept={ACCEPT}
          multiple={false}
          label="Drop an image for your favicon"
          description="Square images work best. Non-square images will be center-cropped."
        />
      ) : (
        <div
          className="flex items-center gap-3 px-3 py-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <img
            src={imageData ?? ''}
            alt="Source image"
            className="h-10 w-10 shrink-0 object-cover"
            style={{ borderRadius: 'var(--radius-sm)' }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Image loaded
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {imageEl.naturalWidth} &times; {imageEl.naturalHeight} px
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setImageData(null);
              setImageEl(null);
            }}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Mode tabs */}
        {modeTabs}

        {/* Input panel */}
        <div
          className="flex flex-col gap-4 px-4 py-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {mode === 'text' ? textInputs : imageInput}
        </div>

        {/* Preview grid */}
        {hasPreviews ? (
          <div
            className="flex flex-col gap-4 px-4 py-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Preview
            </p>
            <div className="flex flex-wrap items-end gap-6">
              {FAVICON_SIZES.map(({ size, label }) => {
                const src = previews[size];
                if (!src) return null;
                // Display size capped for readability
                const displaySize = Math.min(size, 96);
                return (
                  <div key={size} className="flex flex-col items-center gap-2">
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: `${displaySize}px`,
                        height: `${displaySize}px`,
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-primary)',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={src}
                        alt={`Favicon ${label}`}
                        width={displaySize}
                        height={displaySize}
                        style={{ imageRendering: size <= 48 ? 'pixelated' : 'auto' }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-[140px] flex-col items-center justify-center gap-3 px-6 py-8 text-center"
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
              <Globe className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              No preview yet
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {mode === 'text'
                ? 'Enter text or an emoji above to generate favicons.'
                : 'Upload an image above to generate favicons.'}
            </p>
          </div>
        )}

        {/* Download */}
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleDownloadZip}
          disabled={!hasContent}
          loading={zipping}
          leadingIcon={<Download className="h-4 w-4" />}
        >
          Download all as ZIP
        </Button>
      </div>
    </ToolPage>
  );
}

export default FaviconGen;
