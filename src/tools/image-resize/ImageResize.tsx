import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Link2, Unlink } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { getImageInfo, resizeImage, type ImageInfo } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, PERCENTAGE_PRESETS, OUTPUT_FORMATS } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

interface ResizeDefaults {
  lastPercentage: number;
  outputFormat: string;
}

const DEFAULTS: ResizeDefaults = {
  lastPercentage: 100,
  outputFormat: 'png',
};

const sanitizeDefaults = (raw: unknown): ResizeDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const pct = typeof obj.lastPercentage === 'number' ? obj.lastPercentage : DEFAULTS.lastPercentage;
  const fmt = typeof obj.outputFormat === 'string' ? obj.outputFormat : DEFAULTS.outputFormat;
  return { lastPercentage: pct, outputFormat: fmt };
};

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

type ResizeMode = 'percentage' | 'dimensions';

// ─── Component ──────────────────────────────────────────────────────────────

function ImageResize() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []);

  // Source file
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceInfo, setSourceInfo] = useState<ImageInfo | null>(null);
  const [picking, setPicking] = useState(false);

  // Resize options
  const [resizeMode, setResizeMode] = useState<ResizeMode>('percentage');
  const [percentage, setPercentage] = useState(initial.lastPercentage);
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [outputFormat, setOutputFormat] = useState(initial.outputFormat);

  // Result
  const [resultInfo, setResultInfo] = useState<ImageInfo | null>(null);
  const [processing, setProcessing] = useState(false);

  // Persist defaults (didMount flag pattern)
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
        [meta.id]: { lastPercentage: percentage, outputFormat },
      },
    });
  }, [percentage, outputFormat]);

  // Sync dimensions when percentage or source changes
  useEffect(() => {
    if (!sourceInfo || resizeMode !== 'percentage') return;
    setTargetWidth(Math.round(sourceInfo.width * percentage / 100));
    setTargetHeight(Math.round(sourceInfo.height * percentage / 100));
  }, [sourceInfo, percentage, resizeMode]);

  const aspectRatio = sourceInfo ? sourceInfo.width / sourceInfo.height : 1;

  const handleWidthChange = useCallback(
    (val: number) => {
      setTargetWidth(val);
      if (lockAspect && aspectRatio) {
        setTargetHeight(Math.round(val / aspectRatio));
      }
    },
    [lockAspect, aspectRatio],
  );

  const handleHeightChange = useCallback(
    (val: number) => {
      setTargetHeight(val);
      if (lockAspect && aspectRatio) {
        setTargetWidth(Math.round(val * aspectRatio));
      }
    },
    [lockAspect, aspectRatio],
  );

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
      setTargetWidth(info.width);
      setTargetHeight(info.height);
      setResultInfo(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read image';
      showToast(msg, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, showToast]);

  const handleResize = useCallback(async () => {
    if (!filePath || !sourceInfo || processing) return;
    const w = Math.max(1, targetWidth);
    const h = Math.max(1, targetHeight);

    try {
      const outPath = await save({
        filters: [
          {
            name: outputFormat.toUpperCase(),
            extensions: [outputFormat === 'jpg' ? 'jpg' : outputFormat],
          },
        ],
      });
      if (!outPath) return;

      setProcessing(true);
      const result = await resizeImage(filePath, outPath, w, h, lockAspect);
      setResultInfo(result);
      showToast('Image resized successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resize image';
      showToast(msg, 'error');
    } finally {
      setProcessing(false);
    }
  }, [filePath, sourceInfo, targetWidth, targetHeight, lockAspect, outputFormat, processing, showToast]);

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
          Select an image to resize
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Supports PNG, JPEG, WebP, BMP, GIF, TIFF, ICO
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleChooseFile} loading={picking}>
        Choose file...
      </Button>
    </div>
  );

  const modeTabs = (
    <div
      role="tablist"
      aria-label="Resize mode"
      className="inline-flex p-0.5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {([
        { id: 'percentage' as const, label: 'Percentage' },
        { id: 'dimensions' as const, label: 'Dimensions' },
      ]).map((tab) => {
        const isActive = resizeMode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              setResizeMode(tab.id);
              if (tab.id === 'percentage' && sourceInfo) {
                setTargetWidth(Math.round(sourceInfo.width * percentage / 100));
                setTargetHeight(Math.round(sourceInfo.height * percentage / 100));
              }
            }}
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

  const sourcePanel = sourceInfo && (
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
          {sourceInfo.width} x {sourceInfo.height} &middot; {sourceInfo.format.toUpperCase()} &middot; {formatBytes(sourceInfo.size_bytes)}
        </div>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={handleChooseFile} loading={picking}>
        Change
      </Button>
    </div>
  );

  const percentageOptions = (
    <div className="flex flex-wrap gap-2">
      {PERCENTAGE_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => setPercentage(p.value)}
          className="px-3 py-1.5 text-xs font-medium transition-colors duration-150"
          style={{
            backgroundColor: percentage === p.value ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
            color: percentage === p.value ? 'var(--accent)' : 'var(--text-secondary)',
            border: `1px solid ${percentage === p.value ? 'var(--accent)' : 'var(--border-primary)'}`,
            borderRadius: 'var(--radius-sm)',
          }}
          aria-pressed={percentage === p.value}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={1}
          max={1000}
          value={percentage}
          onChange={(e) => setPercentage(Number(e.target.value) || 100)}
          fullWidth={false}
          className="w-20 text-center"
          aria-label="Custom percentage"
        />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>%</span>
      </div>
    </div>
  );

  const dimensionsOptions = (
    <div className="flex items-end gap-3">
      <Input
        label="Width"
        type="number"
        min={1}
        max={10000}
        value={targetWidth || ''}
        onChange={(e) => handleWidthChange(Number(e.target.value) || 0)}
        fullWidth={false}
        className="w-28"
        aria-label="Target width"
      />
      <button
        type="button"
        onClick={() => setLockAspect(!lockAspect)}
        className="mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center transition-colors duration-150"
        style={{
          backgroundColor: lockAspect ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          color: lockAspect ? 'var(--accent)' : 'var(--text-tertiary)',
          border: `1px solid ${lockAspect ? 'var(--accent)' : 'var(--border-primary)'}`,
          borderRadius: 'var(--radius-md)',
        }}
        aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
        aria-pressed={lockAspect}
        title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
      >
        {lockAspect ? <Link2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
      </button>
      <Input
        label="Height"
        type="number"
        min={1}
        max={10000}
        value={targetHeight || ''}
        onChange={(e) => handleHeightChange(Number(e.target.value) || 0)}
        fullWidth={false}
        className="w-28"
        aria-label="Target height"
      />
    </div>
  );

  const resultPanel = resultInfo && (
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
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Dimensions</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {resultInfo.width} x {resultInfo.height}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>File size</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {formatBytes(resultInfo.size_bytes)}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Format</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {resultInfo.format.toUpperCase()}
          </p>
        </div>
        {sourceInfo && (
          <div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Size change</p>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {sourceInfo.size_bytes > 0
                ? `${((1 - resultInfo.size_bytes / sourceInfo.size_bytes) * 100).toFixed(1)}% ${resultInfo.size_bytes <= sourceInfo.size_bytes ? 'smaller' : 'larger'}`
                : '—'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!filePath ? emptyState : (
          <>
            {sourcePanel}

            <div
              className="flex flex-col gap-4 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {modeTabs}
                <Select
                  label="Output format"
                  options={OUTPUT_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  fullWidth={false}
                  className="w-28"
                />
              </div>

              {resizeMode === 'percentage' ? percentageOptions : dimensionsOptions}

              {sourceInfo && targetWidth > 0 && targetHeight > 0 && (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Output: {targetWidth} x {targetHeight} px
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleResize}
              loading={processing}
              disabled={!sourceInfo || targetWidth < 1 || targetHeight < 1}
            >
              Resize &amp; save
            </Button>

            {resultPanel}
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageResize;
