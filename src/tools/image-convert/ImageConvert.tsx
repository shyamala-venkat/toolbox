import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Info } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { getImageInfo, convertImage, type ImageInfo } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, TARGET_FORMATS, type TargetFormat } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

interface ConvertDefaults {
  targetFormat: TargetFormat;
  quality: number;
}

const DEFAULTS: ConvertDefaults = { targetFormat: 'png', quality: 85 };

const sanitizeDefaults = (raw: unknown): ConvertDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const validFormats = new Set(TARGET_FORMATS.map((f) => f.value));
  const fmt = typeof obj.targetFormat === 'string' && validFormats.has(obj.targetFormat as TargetFormat)
    ? (obj.targetFormat as TargetFormat)
    : DEFAULTS.targetFormat;
  const q = typeof obj.quality === 'number' && obj.quality >= 1 && obj.quality <= 100
    ? obj.quality
    : DEFAULTS.quality;
  return { targetFormat: fmt, quality: q };
};

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

// ─── Component ──────────────────────────────────────────────────────────────

function ImageConvert() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceInfo, setSourceInfo] = useState<ImageInfo | null>(null);
  const [picking, setPicking] = useState(false);
  const [showHeicNote, setShowHeicNote] = useState(false);

  const [targetFormat, setTargetFormat] = useState<TargetFormat>(initial.targetFormat);
  const [quality, setQuality] = useState(initial.quality);
  const [resultInfo, setResultInfo] = useState<ImageInfo | null>(null);
  const [processing, setProcessing] = useState(false);

  const targetMeta = TARGET_FORMATS.find((f) => f.value === targetFormat);
  const isLossy = targetMeta?.lossy ?? false;

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
        [meta.id]: { targetFormat, quality },
      },
    });
  }, [targetFormat, quality]);

  const handleChooseFile = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (!selected || typeof selected !== 'string') return;

      // Check for HEIC
      const ext = selected.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'heic' || ext === 'heif' || ext === 'avif') {
        setShowHeicNote(true);
        showToast('HEIC/AVIF files are not supported yet', 'warning');
        return;
      }

      const info = await getImageInfo(selected);
      setFilePath(selected);
      setFileName(basename(selected));
      setSourceInfo(info);
      setResultInfo(null);
      setShowHeicNote(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read image';
      showToast(msg, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  const handleConvert = useCallback(async () => {
    if (!filePath || !sourceInfo || processing) return;
    try {
      const ext = targetFormat === 'jpg' ? 'jpg' : targetFormat;
      const outPath = await save({
        filters: [{ name: (targetMeta?.label ?? targetFormat.toUpperCase()), extensions: [ext] }],
      });
      if (!outPath) return;

      setProcessing(true);
      const result = await convertImage(filePath, outPath, isLossy ? quality : undefined);
      setResultInfo(result);
      showToast('Image converted successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to convert image';
      showToast(msg, 'error');
    } finally {
      setProcessing(false);
    }
  }, [filePath, sourceInfo, targetFormat, targetMeta, quality, isLossy, processing, showToast]);

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
          Select an image to convert
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          PNG, JPEG, WebP, BMP, GIF, TIFF, ICO
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleChooseFile} loading={picking}>
        Choose file...
      </Button>
    </div>
  );

  const heicNotice = showHeicNote && (
    <div
      className="flex items-start gap-2.5 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--info)' }} aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          HEIC/AVIF support coming in a future update
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          These formats require additional codec support. For now, please convert HEIC files
          using a system utility first, then use this tool for further format conversion.
        </p>
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {heicNotice}

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

            {/* Options */}
            <div
              className="flex flex-col gap-4 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Select
                label="Output format"
                options={TARGET_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as TargetFormat)}
              />

              {isLossy && (
                <div className="flex flex-col gap-2">
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
                    className="tb-range w-full"
                    aria-label="Output quality"
                  />
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span>Smallest file</span>
                    <span>Best quality</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleConvert}
              loading={processing}
              disabled={!sourceInfo}
            >
              Convert &amp; save
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
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Format</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {resultInfo.format.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>File size</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatBytes(resultInfo.size_bytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Dimensions</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {resultInfo.width} x {resultInfo.height}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageConvert;
