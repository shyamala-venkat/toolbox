import { useCallback, useRef, useState } from 'react';
import { FolderOpen, Images, Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { useAppStore } from '@/stores/appStore';
import {
  resizeImage,
  convertImage,
  stripExif,
  statFile,
} from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, BATCH_OPERATIONS, type BatchOperation } from './meta';
import { BatchFileRow, type BatchFile } from './BatchFileRow';

const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'] },
];

const TARGET_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'bmp', label: 'BMP' },
  { value: 'gif', label: 'GIF' },
  { value: 'tiff', label: 'TIFF' },
  { value: 'ico', label: 'ICO' },
];

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

/** Replace a file's extension with a new one. */
const replaceExt = (name: string, ext: string): string => {
  const dot = name.lastIndexOf('.');
  return (dot === -1 ? name : name.slice(0, dot)) + '.' + ext;
};

/** Append a path separator and filename to a directory path. */
const joinPath = (dir: string, file: string): string => {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith(sep) ? dir + file : dir + sep + file;
};

// ─── Component ──────────────────────────────────────────────────────────────

function ImageBatch() {
  const showToast = useAppStore((s) => s.showToast);

  const [files, setFiles] = useState<BatchFile[]>([]);
  const [picking, setPicking] = useState(false);

  // Operation
  const [operation, setOperation] = useState<BatchOperation>('resize');

  // Resize options
  const [resizeWidth, setResizeWidth] = useState(800);
  const [resizeHeight, setResizeHeight] = useState(600);
  const [maintainAspect, setMaintainAspect] = useState(true);

  // Compress options
  const [compressQuality, setCompressQuality] = useState(85);

  // Convert options
  const [convertFormat, setConvertFormat] = useState('png');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const abortRef = useRef(false);

  const handleAddFiles = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const selected = await open({ multiple: true, filters: IMAGE_FILTERS });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];

      const existingPaths = new Set(files.map((f) => f.path));
      const newFiles: BatchFile[] = [];

      for (const path of paths) {
        if (typeof path !== 'string' || existingPaths.has(path)) continue;
        try {
          const size = await statFile(path);
          newFiles.push({
            path,
            name: basename(path),
            size,
            status: 'pending',
          });
        } catch {
          // Skip files that can't be stat'd
        }
      }

      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add files';
      showToast(msg, 'error');
    } finally {
      setPicking(false);
    }
  }, [picking, files, showToast]);

  const handleRemoveFile = useCallback((path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setDoneCount(0);
    setErrorCount(0);
  }, []);

  const handleProcess = useCallback(async () => {
    if (processing || files.length === 0) return;

    // Ask for output folder
    const outDir = await open({ directory: true, multiple: false });
    if (!outDir || typeof outDir !== 'string') return;

    abortRef.current = false;
    setProcessing(true);
    setDoneCount(0);
    setErrorCount(0);

    const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    setProgress({ current: 0, total: pendingFiles.length, currentFile: '' });

    let done = 0;
    let errors = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      if (abortRef.current) break;

      const file = pendingFiles[i]!;
      setProgress({ current: i + 1, total: pendingFiles.length, currentFile: file.name });

      // Mark as processing
      setFiles((prev) =>
        prev.map((f) => (f.path === file.path ? { ...f, status: 'processing' as const, error: undefined } : f)),
      );

      try {
        const outExt = operation === 'convert' ? convertFormat : undefined;
        const outName = outExt ? replaceExt(file.name, outExt) : file.name;
        const outPath = joinPath(outDir, outName);

        switch (operation) {
          case 'resize':
            await resizeImage(file.path, outPath, resizeWidth, resizeHeight, maintainAspect);
            break;
          case 'compress':
            await convertImage(file.path, outPath, compressQuality);
            break;
          case 'convert':
            await convertImage(file.path, outPath);
            break;
          case 'strip-exif':
            await stripExif(file.path, outPath);
            break;
        }

        done++;
        setFiles((prev) =>
          prev.map((f) => (f.path === file.path ? { ...f, status: 'done' as const } : f)),
        );
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : 'Processing failed';
        setFiles((prev) =>
          prev.map((f) =>
            f.path === file.path
              ? { ...f, status: 'error' as const, error: msg.length > 80 ? msg.slice(0, 80) + '...' : msg }
              : f,
          ),
        );
      }
    }

    setDoneCount(done);
    setErrorCount(errors);
    setProcessing(false);

    if (errors === 0) {
      showToast(`All ${done} ${done === 1 ? 'image' : 'images'} processed successfully`, 'success');
    } else {
      showToast(`${done} processed, ${errors} failed`, errors > 0 ? 'warning' : 'success');
    }
  }, [
    processing, files, operation,
    resizeWidth, resizeHeight, maintainAspect,
    compressQuality, convertFormat, showToast,
  ]);

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;

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
        <Images className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Add images to process in batch
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Select multiple files to resize, compress, convert, or strip EXIF
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleAddFiles} loading={picking}>
        Add files...
      </Button>
    </div>
  );

  const operationOptions = (
    <div
      className="flex flex-col gap-4 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Select
        label="Operation"
        options={BATCH_OPERATIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={operation}
        onChange={(e) => setOperation(e.target.value as BatchOperation)}
      />

      {operation === 'resize' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <Input
              label="Width"
              type="number"
              min={1}
              max={10000}
              value={resizeWidth}
              onChange={(e) => setResizeWidth(Number(e.target.value) || 800)}
              fullWidth={false}
              className="w-28"
            />
            <span className="mb-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>x</span>
            <Input
              label="Height"
              type="number"
              min={1}
              max={10000}
              value={resizeHeight}
              onChange={(e) => setResizeHeight(Number(e.target.value) || 600)}
              fullWidth={false}
              className="w-28"
            />
          </div>
          <Toggle
            checked={maintainAspect}
            onChange={setMaintainAspect}
            label="Maintain aspect ratio"
            description="Fit within the given dimensions without distortion"
          />
        </div>
      )}

      {operation === 'compress' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Quality
            </label>
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {compressQuality}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={compressQuality}
            onChange={(e) => setCompressQuality(Number(e.target.value))}
            className="tb-range w-full"
            aria-label="Compression quality"
          />
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>Smallest file</span>
            <span>Best quality</span>
          </div>
        </div>
      )}

      {operation === 'convert' && (
        <Select
          label="Target format"
          options={TARGET_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          value={convertFormat}
          onChange={(e) => setConvertFormat(e.target.value)}
        />
      )}

      {operation === 'strip-exif' && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All EXIF metadata will be removed from each image, including GPS coordinates,
          timestamps, and camera information.
        </p>
      )}
    </div>
  );

  const progressBar = processing && (
    <div
      className="flex flex-col gap-2 px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--text-secondary)' }}>
          Processing {progress.current} of {progress.total}
        </span>
        <span className="truncate pl-3" style={{ color: 'var(--text-tertiary)' }} title={progress.currentFile}>
          {progress.currentFile}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
            backgroundColor: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      </div>
    </div>
  );

  const summaryBar = !processing && (doneCount > 0 || errorCount > 0) && (
    <div
      className="flex items-center gap-3 px-4 py-3 text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {doneCount > 0 && (
        <span style={{ color: 'var(--success)' }}>
          {doneCount} {doneCount === 1 ? 'file' : 'files'} processed
        </span>
      )}
      {errorCount > 0 && (
        <span style={{ color: 'var(--danger)' }}>
          {errorCount} {errorCount === 1 ? 'error' : 'errors'}
        </span>
      )}
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-5">
        {files.length === 0 ? emptyState : (
          <>
            {/* File list */}
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
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                  {' '}&middot;{' '}
                  {formatBytes(files.reduce((sum, f) => sum + f.size, 0))} total
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddFiles}
                    loading={picking}
                    disabled={processing}
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add more
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={processing}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
                {files.map((file) => (
                  <BatchFileRow
                    key={file.path}
                    file={file}
                    onRemove={handleRemoveFile}
                    disabled={processing}
                  />
                ))}
              </div>
            </div>

            {operationOptions}
            {progressBar}
            {summaryBar}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleProcess}
                loading={processing}
                disabled={pendingCount === 0}
                leadingIcon={<FolderOpen className="h-4 w-4" />}
              >
                {processing ? 'Processing...' : `Process ${pendingCount} ${pendingCount === 1 ? 'file' : 'files'}`}
              </Button>
              {processing && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => { abortRef.current = true; }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </ToolPage>
  );
}

export default ImageBatch;
