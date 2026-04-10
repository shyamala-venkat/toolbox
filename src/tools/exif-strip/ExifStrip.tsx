import { useCallback, useState } from 'react';
import { AlertTriangle, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { getImageInfo, readExif, stripExif, type ImageInfo } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, SENSITIVE_TAG_PREFIXES } from './meta';

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

const isSensitiveTag = (tag: string): boolean => {
  const lower = tag.toLowerCase().replace(/[\s_-]/g, '');
  return SENSITIVE_TAG_PREFIXES.some((prefix) => lower.startsWith(prefix));
};

// ─── Component ──────────────────────────────────────────────────────────────

function ExifStrip() {
  const showToast = useAppStore((s) => s.showToast);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceInfo, setSourceInfo] = useState<ImageInfo | null>(null);
  const [exifData, setExifData] = useState<[string, string][]>([]);
  const [picking, setPicking] = useState(false);
  const [loadingExif, setLoadingExif] = useState(false);

  const [resultInfo, setResultInfo] = useState<ImageInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stripped, setStripped] = useState(false);

  const sensitiveCount = exifData.filter(([tag]) => isSensitiveTag(tag)).length;

  const handleChooseFile = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (!selected || typeof selected !== 'string') return;

      setLoadingExif(true);
      const [info, tags] = await Promise.all([
        getImageInfo(selected),
        readExif(selected),
      ]);
      setFilePath(selected);
      setFileName(basename(selected));
      setSourceInfo(info);
      setExifData(tags);
      setResultInfo(null);
      setStripped(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read image';
      showToast(msg, 'error');
    } finally {
      setPicking(false);
      setLoadingExif(false);
    }
  }, [picking, showToast]);

  const handleStrip = useCallback(async () => {
    if (!filePath || processing) return;
    try {
      const ext = sourceInfo?.format.toLowerCase() === 'jpeg' ? 'jpg' : (sourceInfo?.format.toLowerCase() ?? 'png');
      const outPath = await save({
        filters: [{ name: (sourceInfo?.format ?? 'PNG').toUpperCase(), extensions: [ext] }],
      });
      if (!outPath) return;

      setProcessing(true);
      const result = await stripExif(filePath, outPath);
      setResultInfo(result);
      setStripped(true);
      showToast('EXIF metadata removed successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to strip EXIF data';
      showToast(msg, 'error');
    } finally {
      setProcessing(false);
    }
  }, [filePath, sourceInfo, processing, showToast]);

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
          Select an image to inspect EXIF data
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          View metadata and strip sensitive fields like GPS coordinates
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleChooseFile} loading={picking}>
        Choose file...
      </Button>
    </div>
  );

  const exifTable = exifData.length > 0 && (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          EXIF Metadata ({exifData.length} {exifData.length === 1 ? 'field' : 'fields'})
        </p>
        {sensitiveCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--warning)' }} aria-hidden="true" />
            <span className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
              {sensitiveCount} sensitive {sensitiveCount === 1 ? 'field' : 'fields'}
            </span>
          </div>
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <th
                className="sticky top-0 px-4 py-2 text-left font-medium"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                Tag
              </th>
              <th
                className="sticky top-0 px-4 py-2 text-left font-medium"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {exifData.map(([tag, value], idx) => {
              const sensitive = isSensitiveTag(tag);
              return (
                <tr
                  key={`${tag}-${idx}`}
                  style={{
                    backgroundColor: sensitive ? 'var(--accent-subtle)' : (idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)'),
                    borderTop: '1px solid var(--border-secondary)',
                  }}
                >
                  <td className="px-4 py-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      {sensitive && (
                        <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: 'var(--warning)' }} aria-hidden="true" />
                      )}
                      {tag}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-4 py-1.5" title={value}>
                    {value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const noExifNotice = exifData.length === 0 && filePath && !loadingExif && (
    <div
      className="flex items-center gap-2.5 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden="true" />
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        No EXIF metadata found in this image.
      </p>
    </div>
  );

  const resultPanel = resultInfo && stripped && (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" style={{ color: 'var(--success)' }} aria-hidden="true" />
        <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
          EXIF metadata removed
        </p>
      </div>
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
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Fields removed</p>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {exifData.length}
          </p>
        </div>
      </div>
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

            {exifTable}
            {noExifNotice}

            {exifData.length > 0 && !stripped && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleStrip}
                loading={processing}
              >
                Strip &amp; save
              </Button>
            )}

            {resultPanel}
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ExifStrip;
