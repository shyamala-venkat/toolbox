import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { getImageInfo, convertImage, type ImageInfo } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

interface CompressDefaults {
  quality: number;
}

const DEFAULTS: CompressDefaults = { quality: 85 };

const sanitizeDefaults = (raw: unknown): CompressDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const q = typeof obj.quality === 'number' && obj.quality >= 1 && obj.quality <= 100
    ? obj.quality
    : DEFAULTS.quality;
  return { quality: q };
};

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

/** Whether quality slider has any effect for a given format. */
const isLossyFormat = (fmt: string): boolean => {
  const lower = fmt.toLowerCase();
  return lower === 'jpeg' || lower === 'jpg' || lower === 'webp';
};

// ─── Component ──────────────────────────────────────────────────────────────

function ImageCompress() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceInfo, setSourceInfo] = useState<ImageInfo | null>(null);
  const [picking, setPicking] = useState(false);

  const [quality, setQuality] = useState(initial.quality);
  const [resultInfo, setResultInfo] = useState<ImageInfo | null>(null);
  const [processing, setProcessing] = useState(false);

  // Persist defaults
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
        [meta.id]: { quality },
      },
    });
  }, [quality]);

  const lossy = sourceInfo ? isLossyFormat(sourceInfo.format) : false;

  const handleChooseFile = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (!selected || typeof selected !== 'string') return;
      const info = await getImageInfo(selected);
      setFilePath(selected);
      setFileName(basename(selected));
      setSourceInfo(info);
      setResultInfo(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read image';
      showToast(msg, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  const handleCompress = useCallback(async () => {
    if (!filePath || !sourceInfo || processing) return;
    try {
      // Output in same format as input
      const ext = sourceInfo.format.toLowerCase() === 'jpeg' ? 'jpg' : sourceInfo.format.toLowerCase();
      const outPath = await save({
        filters: [{ name: sourceInfo.format.toUpperCase(), extensions: [ext] }],
      });
      if (!outPath) return;

      setProcessing(true);
      const result = await convertImage(filePath, outPath, lossy ? quality : undefined);
      setResultInfo(result);
      showToast('Image compressed successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to compress image';
      showToast(msg, 'error');
    } finally {
      setProcessing(false);
    }
  }, [filePath, sourceInfo, quality, lossy, processing, showToast]);

  const savings = sourceInfo && resultInfo && sourceInfo.size_bytes > 0
    ? ((1 - resultInfo.size_bytes / sourceInfo.size_bytes) * 100)
    : null;

  // ─── Render ────────────────────────────────────────────────────────────────

  const emptyState = (
    <div
      className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center"
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
          Select an image to compress
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Quality control for JPEG and WebP. PNG is always lossless.
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleChooseFile} loading={picking}>
        Choose file...
      </Button>
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!filePath ? emptyState : (
          <>
            {/* Source info */}
            <div
              className="flex items-center gap-3 px-3 py-3"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }} title={fileName}>
                  {fileName}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {sourceInfo?.width} x {sourceInfo?.height} &middot; {sourceInfo?.format.toUpperCase()} &middot; {formatBytes(sourceInfo?.size_bytes ?? 0)}
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleChooseFile} loading={picking}>
                Change
              </Button>
            </div>

            {/* Quality slider */}
            <div
              className="flex flex-col gap-3 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Quality
                </label>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {quality}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={!lossy}
                className="tb-range w-full"
                aria-label="Compression quality"
              />
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>Smallest file</span>
                <span>Best quality</span>
              </div>
              {!lossy && sourceInfo && (
                <p
                  className="mt-1 text-xs"
                  style={{
                    color: 'var(--info)',
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {sourceInfo.format.toUpperCase()} is lossless — quality slider does not apply. The image will be re-saved as-is.
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleCompress}
              loading={processing}
              disabled={!sourceInfo}
            >
              Compress &amp; save
            </Button>

            {/* Result */}
            {resultInfo && (
              <div
                className="flex flex-col gap-3 px-4 py-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  Result
                </p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Before</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatBytes(sourceInfo?.size_bytes ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>After</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatBytes(resultInfo.size_bytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Savings</p>
                    <p
                      className="font-medium"
                      style={{
                        color:
                          savings !== null && savings > 0
                            ? 'var(--success)'
                            : savings !== null && savings < 0
                              ? 'var(--danger)'
                              : 'var(--text-primary)',
                      }}
                    >
                      {savings !== null ? `${savings.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>
                {savings !== null && savings < 0 && (
                  <div
                    className="mt-3 rounded px-3 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--accent-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    This image is already well-compressed. The built-in encoder produced a
                    larger file at this quality level. Try lowering the quality slider to
                    40-50%, or the original may already be optimally compressed.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageCompress;
