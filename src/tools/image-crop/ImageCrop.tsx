import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Scissors } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB warning threshold
const ACCEPT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
const HANDLE_SIZE = 8;
const MIN_CROP = 10;

type AspectPreset = 'free' | '1:1' | '16:9' | '4:3' | '3:2';

const ASPECT_OPTIONS: { value: AspectPreset; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '16:9', label: '16:9 (Widescreen)' },
  { value: '4:3', label: '4:3 (Standard)' },
  { value: '3:2', label: '3:2 (Photo)' },
];

const ASPECT_RATIOS: Record<AspectPreset, number | null> = {
  free: null,
  '1:1': 1,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
};

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragHandle =
  | 'move'
  | 'nw' | 'ne' | 'sw' | 'se'
  | 'n' | 's' | 'e' | 'w';

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val));

/** Return initial crop rect centered in the image, respecting aspect ratio. */
const getInitialCrop = (
  imgW: number,
  imgH: number,
  ratio: number | null,
): CropRect => {
  let w: number;
  let h: number;

  if (ratio !== null) {
    if (imgW / imgH > ratio) {
      h = imgH * 0.8;
      w = h * ratio;
    } else {
      w = imgW * 0.8;
      h = w / ratio;
    }
  } else {
    w = imgW * 0.8;
    h = imgH * 0.8;
  }

  return {
    x: (imgW - w) / 2,
    y: (imgH - h) / 2,
    w,
    h,
  };
};

/** Constrain a crop rect to image bounds while maintaining min size. */
const constrainCrop = (
  crop: CropRect,
  imgW: number,
  imgH: number,
  ratio: number | null,
): CropRect => {
  let { x, y, w, h } = crop;

  w = clamp(w, MIN_CROP, imgW);
  h = clamp(h, MIN_CROP, imgH);

  if (ratio !== null) {
    if (w / h > ratio) {
      w = h * ratio;
    } else {
      h = w / ratio;
    }
    w = clamp(w, MIN_CROP, imgW);
    h = clamp(h, MIN_CROP, imgH);
  }

  x = clamp(x, 0, imgW - w);
  y = clamp(y, 0, imgH - h);

  return { x, y, w, h };
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

function ImageCrop() {
  const showToast = useAppStore((s) => s.showToast);

  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>('free');

  // Crop state is in image-space coordinates
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Canvas display refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drag state
  const dragRef = useRef<{
    handle: DragHandle;
    startMouse: { x: number; y: number };
    startCrop: CropRect;
  } | null>(null);

  // Display scale: how the image maps onto the canvas element
  const [displayScale, setDisplayScale] = useState(1);

  // ─── Image loading ──────────────────────────────────────────────────────

  const handleFileDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (file.size > MAX_IMAGE_SIZE) {
        showToast(
          'Image is larger than 10 MB. Processing may be slow.',
          'warning',
        );
      }

      // Clean up previous
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImageData(dataUrl);
        setImageName(file.name.replace(/\.[^.]+$/, ''));
      };
      reader.onerror = () => {
        showToast('Failed to read image file.', 'error');
      };
      reader.readAsDataURL(file);
    },
    [showToast, resultUrl],
  );

  // Load image element when data changes
  useEffect(() => {
    if (!imageData) {
      setImageEl(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      const ratio = ASPECT_RATIOS[aspect];
      setCrop(getInitialCrop(img.naturalWidth, img.naturalHeight, ratio));
    };
    img.onerror = () => {
      showToast('Failed to decode image.', 'error');
      setImageData(null);
    };
    img.src = imageData;
  }, [imageData]); // aspect intentionally excluded — only recompute on new image

  // ─── Recompute crop when aspect changes ───────────────────────────────

  useEffect(() => {
    if (!imageEl) return;
    const ratio = ASPECT_RATIOS[aspect];
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    setCrop((prev) => constrainCrop(prev, imgW, imgH, ratio));
  }, [aspect, imageEl]);

  // ─── Draw canvas ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageEl) return;

    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;

    // Fit canvas to container, accounting for DPR
    const rect = container.getBoundingClientRect();
    const maxW = rect.width;
    const maxH = 500;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    setDisplayScale(scale);

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

    // Draw dimmed overlay outside crop
    const cx = crop.x * scale;
    const cy = crop.y * scale;
    const cWidth = crop.w * scale;
    const cHeight = crop.h * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    // Top
    ctx.fillRect(0, 0, cw, cy);
    // Bottom
    ctx.fillRect(0, cy + cHeight, cw, ch - cy - cHeight);
    // Left
    ctx.fillRect(0, cy, cx, cHeight);
    // Right
    ctx.fillRect(cx + cWidth, cy, cw - cx - cWidth, cHeight);

    // Crop border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cy, cWidth, cHeight);

    // Rule of thirds grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 2; i++) {
      const gx = cx + (cWidth / 3) * i;
      const gy = cy + (cHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(gx, cy);
      ctx.lineTo(gx, cy + cHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, gy);
      ctx.lineTo(cx + cWidth, gy);
      ctx.stroke();
    }

    // Corner handles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    const hs = HANDLE_SIZE * (1 / scale > 2 ? 1.5 : 1);
    const handles: [number, number][] = [
      [cx, cy],
      [cx + cWidth, cy],
      [cx, cy + cHeight],
      [cx + cWidth, cy + cHeight],
      [cx + cWidth / 2, cy],
      [cx + cWidth / 2, cy + cHeight],
      [cx, cy + cHeight / 2],
      [cx + cWidth, cy + cHeight / 2],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
  }, [imageEl, crop, displayScale]);

  // ─── Drag logic ───────────────────────────────────────────────────────

  const getHandle = useCallback(
    (ex: number, ey: number): DragHandle | null => {
      const scale = displayScale;
      const cx = crop.x * scale;
      const cy = crop.y * scale;
      const cw = crop.w * scale;
      const ch = crop.h * scale;
      const ht = HANDLE_SIZE * 1.5; // hit tolerance

      // Check corners first (higher priority)
      if (Math.abs(ex - cx) < ht && Math.abs(ey - cy) < ht) return 'nw';
      if (Math.abs(ex - (cx + cw)) < ht && Math.abs(ey - cy) < ht) return 'ne';
      if (Math.abs(ex - cx) < ht && Math.abs(ey - (cy + ch)) < ht) return 'sw';
      if (Math.abs(ex - (cx + cw)) < ht && Math.abs(ey - (cy + ch)) < ht) return 'se';

      // Edges
      if (Math.abs(ey - cy) < ht && ex > cx && ex < cx + cw) return 'n';
      if (Math.abs(ey - (cy + ch)) < ht && ex > cx && ex < cx + cw) return 's';
      if (Math.abs(ex - cx) < ht && ey > cy && ey < cy + ch) return 'w';
      if (Math.abs(ex - (cx + cw)) < ht && ey > cy && ey < cy + ch) return 'e';

      // Inside = move
      if (ex >= cx && ex <= cx + cw && ey >= cy && ey <= cy + ch) return 'move';

      return null;
    },
    [crop, displayScale],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageEl) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const handle = getHandle(mx, my);
      if (!handle) return;

      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      dragRef.current = {
        handle,
        startMouse: { x: mx, y: my },
        startCrop: { ...crop },
      };
    },
    [crop, getHandle, imageEl],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageEl) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Update cursor
      if (!dragRef.current) {
        const handle = getHandle(mx, my);
        const cursors: Record<string, string> = {
          nw: 'nw-resize',
          ne: 'ne-resize',
          sw: 'sw-resize',
          se: 'se-resize',
          n: 'n-resize',
          s: 's-resize',
          e: 'e-resize',
          w: 'w-resize',
          move: 'move',
        };
        canvas.style.cursor = handle ? cursors[handle] ?? 'default' : 'default';
        return;
      }

      e.preventDefault();
      const scale = displayScale;
      const { handle, startMouse, startCrop } = dragRef.current;
      const dx = (mx - startMouse.x) / scale;
      const dy = (my - startMouse.y) / scale;
      const imgW = imageEl.naturalWidth;
      const imgH = imageEl.naturalHeight;
      const ratio = ASPECT_RATIOS[aspect];

      let next: CropRect;

      if (handle === 'move') {
        next = {
          ...startCrop,
          x: clamp(startCrop.x + dx, 0, imgW - startCrop.w),
          y: clamp(startCrop.y + dy, 0, imgH - startCrop.h),
        };
      } else {
        let { x, y, w, h } = startCrop;

        // Compute new edges based on handle
        if (handle.includes('e')) w = startCrop.w + dx;
        if (handle.includes('w')) { x = startCrop.x + dx; w = startCrop.w - dx; }
        if (handle.includes('s')) h = startCrop.h + dy;
        if (handle.includes('n')) { y = startCrop.y + dy; h = startCrop.h - dy; }

        // Enforce minimum size
        if (w < MIN_CROP) {
          if (handle.includes('w')) x = startCrop.x + startCrop.w - MIN_CROP;
          w = MIN_CROP;
        }
        if (h < MIN_CROP) {
          if (handle.includes('n')) y = startCrop.y + startCrop.h - MIN_CROP;
          h = MIN_CROP;
        }

        // Apply aspect ratio constraint
        if (ratio !== null) {
          if (handle === 'n' || handle === 's') {
            w = h * ratio;
          } else if (handle === 'e' || handle === 'w') {
            h = w / ratio;
          } else {
            // Corner — use the dominant axis
            if (Math.abs(dx) > Math.abs(dy)) {
              h = w / ratio;
            } else {
              w = h * ratio;
            }
          }
        }

        next = constrainCrop({ x, y, w, h }, imgW, imgH, ratio);
      }

      setCrop(next);
    },
    [displayScale, aspect, imageEl, getHandle],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragRef.current) {
        const canvas = canvasRef.current;
        if (canvas) canvas.releasePointerCapture(e.pointerId);
        dragRef.current = null;
      }
    },
    [],
  );

  // ─── Crop execution ───────────────────────────────────────────────────

  const handleCrop = useCallback(() => {
    if (!imageEl || processing) return;
    setProcessing(true);

    try {
      const offscreen = document.createElement('canvas');
      const cx = Math.round(crop.x);
      const cy = Math.round(crop.y);
      const cw = Math.round(crop.w);
      const ch = Math.round(crop.h);

      offscreen.width = cw;
      offscreen.height = ch;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        showToast('Canvas context unavailable.', 'error');
        return;
      }

      ctx.drawImage(imageEl, cx, cy, cw, ch, 0, 0, cw, ch);

      offscreen.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Failed to generate cropped image.', 'error');
            setProcessing(false);
            return;
          }

          if (resultUrl) URL.revokeObjectURL(resultUrl);
          const url = URL.createObjectURL(blob);
          setResultUrl(url);
          setProcessing(false);
          showToast('Image cropped successfully.', 'success');
        },
        'image/png',
      );
    } catch {
      showToast('Failed to crop image.', 'error');
      setProcessing(false);
    }
  }, [imageEl, crop, processing, resultUrl, showToast]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    try {
      triggerDownload(resultUrl, `${imageName || 'cropped'}-cropped.png`);
    } catch {
      showToast('Could not download image.', 'error');
    }
  }, [resultUrl, imageName, showToast]);

  const handleReset = useCallback(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setImageData(null);
    setImageEl(null);
    setImageName('');
    setCrop({ x: 0, y: 0, w: 0, h: 0 });
  }, [resultUrl]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  // ─── Render ───────────────────────────────────────────────────────────

  const cropW = Math.round(crop.w);
  const cropH = Math.round(crop.h);

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!imageEl ? (
          <FileDropZone
            onDrop={handleFileDrop}
            accept={ACCEPT}
            multiple={false}
            label="Drop an image to crop"
            description="Supports PNG, JPEG, WebP, BMP, GIF"
          />
        ) : (
          <>
            {/* Controls bar */}
            <div
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-48">
                  <Select
                    label="Aspect ratio"
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value as AspectPreset)}
                    options={ASPECT_OPTIONS}
                  />
                </div>
                <div
                  className="flex flex-col gap-0.5"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Selection
                  </span>
                  <span className="text-xs">
                    {cropW} &times; {cropH} px
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                >
                  Change image
                </Button>
              </div>
            </div>

            {/* Canvas */}
            <div
              ref={containerRef}
              className="flex items-center justify-center overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                minHeight: '200px',
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ touchAction: 'none', display: 'block' }}
                aria-label="Crop area. Drag corners or edges to adjust the crop rectangle."
                role="img"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleCrop}
                loading={processing}
                leadingIcon={<Scissors className="h-4 w-4" />}
              >
                Crop
              </Button>
              {resultUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleDownload}
                  leadingIcon={<Download className="h-4 w-4" />}
                >
                  Download PNG
                </Button>
              )}
            </div>

            {/* Result preview */}
            {resultUrl && (
              <div
                className="flex flex-col gap-3 px-4 py-4"
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
                  Cropped result
                </p>
                <div className="flex items-center justify-center">
                  <img
                    src={resultUrl}
                    alt="Cropped image preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '300px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-primary)',
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {cropW} &times; {cropH} px
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageCrop;
