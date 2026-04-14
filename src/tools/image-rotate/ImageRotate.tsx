import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ACCEPT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

interface TransformState {
  /** Cumulative rotation in degrees (0, 90, 180, 270). */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

const INITIAL_TRANSFORM: TransformState = {
  rotation: 0,
  flipH: false,
  flipV: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalize rotation to 0, 90, 180, or 270. */
const normalizeRotation = (deg: number): number => ((deg % 360) + 360) % 360;

const triggerDownload = (href: string, filename: string): void => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const describeTransform = (t: TransformState): string => {
  const parts: string[] = [];
  if (t.rotation !== 0) parts.push(`Rotated ${t.rotation}°`);
  if (t.flipH) parts.push('Flipped horizontally');
  if (t.flipV) parts.push('Flipped vertically');
  return parts.length > 0 ? parts.join(' · ') : 'No transforms applied';
};

// ─── Component ──────────────────────────────────────────────────────────────

function ImageRotate() {
  const showToast = useAppStore((s) => s.showToast);

  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<TransformState>(INITIAL_TRANSFORM);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        setTransform(INITIAL_TRANSFORM);
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

  // ─── Draw preview ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageEl) return;

    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    const { rotation, flipH, flipV } = transform;

    const isRotated90 = rotation === 90 || rotation === 270;
    const outW = isRotated90 ? imgH : imgW;
    const outH = isRotated90 ? imgW : imgH;

    // Fit to container
    const rect = container.getBoundingClientRect();
    const maxW = rect.width;
    const maxH = 500;
    const scale = Math.min(maxW / outW, maxH / outH, 1);
    const cw = Math.round(outW * scale);
    const ch = Math.round(outH * scale);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(imageEl, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
    ctx.restore();
  }, [imageEl, transform]);

  // ─── Transform actions ────────────────────────────────────────────────

  const rotateCW = useCallback(() => {
    setTransform((t) => ({
      ...t,
      rotation: normalizeRotation(t.rotation + 90),
    }));
    setResultUrl(null);
  }, []);

  const rotateCCW = useCallback(() => {
    setTransform((t) => ({
      ...t,
      rotation: normalizeRotation(t.rotation - 90),
    }));
    setResultUrl(null);
  }, []);

  const rotate180 = useCallback(() => {
    setTransform((t) => ({
      ...t,
      rotation: normalizeRotation(t.rotation + 180),
    }));
    setResultUrl(null);
  }, []);

  const toggleFlipH = useCallback(() => {
    setTransform((t) => ({ ...t, flipH: !t.flipH }));
    setResultUrl(null);
  }, []);

  const toggleFlipV = useCallback(() => {
    setTransform((t) => ({ ...t, flipV: !t.flipV }));
    setResultUrl(null);
  }, []);

  const resetTransform = useCallback(() => {
    setTransform(INITIAL_TRANSFORM);
    setResultUrl(null);
  }, []);

  // ─── Download ─────────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!imageEl) return;

    try {
      const imgW = imageEl.naturalWidth;
      const imgH = imageEl.naturalHeight;
      const { rotation, flipH, flipV } = transform;

      const isRotated90 = rotation === 90 || rotation === 270;
      const outW = isRotated90 ? imgH : imgW;
      const outH = isRotated90 ? imgW : imgH;

      const offscreen = document.createElement('canvas');
      offscreen.width = outW;
      offscreen.height = outH;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        showToast('Canvas context unavailable.', 'error');
        return;
      }

      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(imageEl, -imgW / 2, -imgH / 2, imgW, imgH);

      offscreen.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Failed to generate image.', 'error');
            return;
          }
          if (resultUrl) URL.revokeObjectURL(resultUrl);
          const url = URL.createObjectURL(blob);
          setResultUrl(url);
          triggerDownload(url, `${imageName || 'image'}-transformed.png`);
          showToast('Image downloaded successfully.', 'success');
        },
        'image/png',
      );
    } catch {
      showToast('Failed to process image.', 'error');
    }
  }, [imageEl, transform, imageName, resultUrl, showToast]);

  const handleChangeImage = useCallback(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setImageData(null);
    setImageEl(null);
    setImageName('');
    setTransform(INITIAL_TRANSFORM);
  }, [resultUrl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  // ─── Render ───────────────────────────────────────────────────────────

  const hasTransform =
    transform.rotation !== 0 || transform.flipH || transform.flipV;

  const { rotation } = transform;
  const isRotated90 = rotation === 90 || rotation === 270;
  const outW = imageEl ? (isRotated90 ? imageEl.naturalHeight : imageEl.naturalWidth) : 0;
  const outH = imageEl ? (isRotated90 ? imageEl.naturalWidth : imageEl.naturalHeight) : 0;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!imageEl ? (
          <FileDropZone
            onDrop={handleFileDrop}
            accept={ACCEPT}
            multiple={false}
            label="Drop an image to transform"
            description="Supports PNG, JPEG, WebP, BMP, GIF"
          />
        ) : (
          <>
            {/* Transform buttons */}
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={rotateCCW}
                leadingIcon={<RotateCcw className="h-4 w-4" />}
                aria-label="Rotate 90 degrees counter-clockwise"
              >
                90° CCW
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={rotateCW}
                leadingIcon={<RotateCw className="h-4 w-4" />}
                aria-label="Rotate 90 degrees clockwise"
              >
                90° CW
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={rotate180}
                aria-label="Rotate 180 degrees"
              >
                180°
              </Button>

              <div
                className="mx-1 h-5"
                style={{
                  width: '1px',
                  backgroundColor: 'var(--border-primary)',
                }}
                aria-hidden="true"
              />

              <Button
                type="button"
                variant={transform.flipH ? 'primary' : 'secondary'}
                size="sm"
                onClick={toggleFlipH}
                leadingIcon={<FlipHorizontal2 className="h-4 w-4" />}
                aria-label="Flip horizontally"
                aria-pressed={transform.flipH}
              >
                Flip H
              </Button>
              <Button
                type="button"
                variant={transform.flipV ? 'primary' : 'secondary'}
                size="sm"
                onClick={toggleFlipV}
                leadingIcon={<FlipVertical2 className="h-4 w-4" />}
                aria-label="Flip vertically"
                aria-pressed={transform.flipV}
              >
                Flip V
              </Button>

              <div
                className="mx-1 h-5"
                style={{
                  width: '1px',
                  backgroundColor: 'var(--border-primary)',
                }}
                aria-hidden="true"
              />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetTransform}
                disabled={!hasTransform}
              >
                Reset
              </Button>
            </div>

            {/* Status bar */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {describeTransform(transform)}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Output: {outW} &times; {outH} px
              </p>
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
                padding: '1rem',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ display: 'block' }}
                aria-label="Transformed image preview"
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
                disabled={!hasTransform}
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

export default ImageRotate;
