import { useCallback, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { getImageInfo, resizeImage, type ImageInfo } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, SOCIAL_PRESETS, type SocialPreset } from './meta';

// ─── Helpers ────────────────────────────────────────────────────────────────

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

/** Infer a sensible output extension from the source file name. */
const inferExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return 'png';
  const ext = fileName.slice(dot + 1).toLowerCase();
  const allowed = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico']);
  return allowed.has(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'png';
};

// ─── Component ──────────────────────────────────────────────────────────────

function SocialImage() {
  const showToast = useAppStore((s) => s.showToast);

  // Source file
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceInfo, setSourceInfo] = useState<ImageInfo | null>(null);
  const [picking, setPicking] = useState(false);

  // Preset selection
  // SOCIAL_PRESETS is a non-empty static array; the assertion is safe.
  const [selectedPreset, setSelectedPreset] = useState<SocialPreset>(SOCIAL_PRESETS[0]!);

  // Result
  const [resultInfo, setResultInfo] = useState<ImageInfo | null>(null);
  const [processing, setProcessing] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

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

  const handleResize = useCallback(async () => {
    if (!filePath || !sourceInfo || processing) return;

    const ext = inferExtension(fileName);
    try {
      const outPath = await save({
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!outPath) return;

      setProcessing(true);
      const result = await resizeImage(
        filePath,
        outPath,
        selectedPreset.width,
        selectedPreset.height,
        false, // don't maintain aspect — social presets are exact dimensions
      );
      setResultInfo(result);
      showToast('Image resized successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resize image';
      showToast(msg, 'error');
    } finally {
      setProcessing(false);
    }
  }, [filePath, sourceInfo, fileName, selectedPreset, processing, showToast]);

  // ─── Render pieces ─────────────────────────────────────────────────────────

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
          Select an image to resize for social media
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

  const presetGrid = (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        Platform preset
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        role="radiogroup"
        aria-label="Social media platform preset"
      >
        {SOCIAL_PRESETS.map((preset) => {
          const isSelected = selectedPreset.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedPreset(preset)}
              className="flex flex-col gap-1 px-3 py-2.5 text-left transition-colors duration-150"
              style={{
                backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-primary)'}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {preset.platform}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {preset.label} &middot; {preset.width}x{preset.height}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Output: {selectedPreset.width} x {selectedPreset.height} px
      </p>
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
                : '\u2014'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {!filePath ? emptyState : (
          <>
            {sourcePanel}
            {presetGrid}

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleResize}
              loading={processing}
              disabled={!sourceInfo}
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

export default SocialImage;
