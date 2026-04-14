import { useCallback, useState } from 'react';
import { Archive, Download, FileText, Loader2, X } from 'lucide-react';
import { zipSync, unzipSync } from 'fflate';
import { ToolPage } from '@/components/tool/ToolPage';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { formatBytes } from '@/lib/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type TabId = 'create' | 'extract';

interface FileEntry {
  id: string;
  name: string;
  size: number;
  data: Uint8Array;
}

interface ExtractedEntry {
  name: string;
  size: number;
  data: Uint8Array;
  selected: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FILE_WARNING = 100 * 1024 * 1024; // 100 MB warning threshold

let entryIdCounter = 0;
const nextId = (): string => `file-${++entryIdCounter}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Component ──────────────────────────────────────────────────────────────

function ZipTool() {
  const showToast = useAppStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<TabId>('create');

  // Create tab state
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [creating, setCreating] = useState(false);

  // Extract tab state
  const [extractedFiles, setExtractedFiles] = useState<ExtractedEntry[]>([]);
  const [zipName, setZipName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // ─── Create tab handlers ──────────────────────────────────────────────

  const handleAddFiles = useCallback(
    async (dropped: File[]) => {
      const newEntries: FileEntry[] = [];
      let warnedSize = false;

      for (const f of dropped) {
        if (f.size > MAX_FILE_WARNING && !warnedSize) {
          showToast(
            `"${f.name}" is larger than 100 MB. ZIP creation may be slow.`,
            'warning',
          );
          warnedSize = true;
        }

        try {
          const buffer = await f.arrayBuffer();
          newEntries.push({
            id: nextId(),
            name: f.name,
            size: f.size,
            data: new Uint8Array(buffer),
          });
        } catch {
          showToast(`Could not read "${f.name}".`, 'error');
        }
      }

      if (newEntries.length > 0) {
        setFiles((prev) => [...prev, ...newEntries]);
      }
    },
    [showToast],
  );

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const handleCreateZip = useCallback(() => {
    if (files.length === 0) {
      showToast('Add files to create a ZIP archive.', 'warning');
      return;
    }

    setCreating(true);
    try {
      // Build the data object for fflate
      const data: Record<string, Uint8Array> = {};
      for (const entry of files) {
        // Handle duplicate filenames by appending a suffix
        let name = entry.name;
        let counter = 1;
        while (data[name] !== undefined) {
          const dotIndex = entry.name.lastIndexOf('.');
          if (dotIndex > 0) {
            name = `${entry.name.substring(0, dotIndex)}_${counter}${entry.name.substring(dotIndex)}`;
          } else {
            name = `${entry.name}_${counter}`;
          }
          counter++;
        }
        data[name] = entry.data;
      }

      const zipped = zipSync(data, { level: 6 });
      const blob = new Blob([zipped], { type: 'application/zip' });
      triggerBlobDownload(blob, 'archive.zip');

      showToast(
        `Created ZIP with ${files.length} file${files.length !== 1 ? 's' : ''} (${formatBytes(zipped.byteLength)}).`,
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`ZIP creation failed: ${msg}`, 'error');
    } finally {
      setCreating(false);
    }
  }, [files, showToast]);

  // ─── Extract tab handlers ─────────────────────────────────────────────

  const handleDropZip = useCallback(
    async (dropped: File[]) => {
      const file = dropped[0];
      if (!file) return;

      if (
        !file.name.toLowerCase().endsWith('.zip') &&
        file.type !== 'application/zip' &&
        file.type !== 'application/x-zip-compressed'
      ) {
        showToast(`"${file.name}" does not appear to be a ZIP file.`, 'warning');
        return;
      }

      if (file.size > MAX_FILE_WARNING) {
        showToast(
          `"${file.name}" is larger than 100 MB. Extraction may be slow.`,
          'warning',
        );
      }

      setExtracting(true);
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const extracted = unzipSync(data);

        const entries: ExtractedEntry[] = Object.entries(extracted)
          .filter(([name]) => !name.endsWith('/')) // skip directories
          .map(([name, bytes]) => ({
            name,
            size: bytes.byteLength,
            data: bytes,
            selected: false,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setExtractedFiles(entries);
        setZipName(file.name);

        if (entries.length === 0) {
          showToast('ZIP archive is empty.', 'warning');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isCurrupt =
          msg.toLowerCase().includes('invalid') ||
          msg.toLowerCase().includes('corrupt');
        showToast(
          isCurrupt
            ? `"${file.name}" appears to be corrupted.`
            : `Could not extract: ${msg}`,
          'error',
        );
        setExtractedFiles([]);
        setZipName(null);
      } finally {
        setExtracting(false);
      }
    },
    [showToast],
  );

  const toggleFileSelection = useCallback((index: number) => {
    setExtractedFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f)),
    );
  }, []);

  const handleDownloadFile = useCallback(
    (entry: ExtractedEntry) => {
      try {
        // Detect if it's a text file and use appropriate MIME type
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
        const textExts = new Set([
          'txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'csv',
          'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'svg', 'sql',
        ]);
        const mimeType = textExts.has(ext)
          ? 'text/plain;charset=utf-8'
          : 'application/octet-stream';

        const blob = new Blob([entry.data], { type: mimeType });
        // Use only the filename part (strip directory path)
        const filename = entry.name.split('/').pop() ?? entry.name;
        triggerBlobDownload(blob, filename);
      } catch {
        showToast(`Could not download "${entry.name}".`, 'error');
      }
    },
    [showToast],
  );

  const handleExtractAll = useCallback(() => {
    for (const entry of extractedFiles) {
      handleDownloadFile(entry);
    }
    showToast(
      `Downloading ${extractedFiles.length} file${extractedFiles.length !== 1 ? 's' : ''}.`,
      'success',
    );
  }, [extractedFiles, handleDownloadFile, showToast]);

  const handleExtractSelected = useCallback(() => {
    const selected = extractedFiles.filter((f) => f.selected);
    if (selected.length === 0) {
      showToast('No files selected.', 'warning');
      return;
    }
    for (const entry of selected) {
      handleDownloadFile(entry);
    }
    showToast(
      `Downloading ${selected.length} file${selected.length !== 1 ? 's' : ''}.`,
      'success',
    );
  }, [extractedFiles, handleDownloadFile, showToast]);

  const handleClearExtracted = useCallback(() => {
    setExtractedFiles([]);
    setZipName(null);
  }, []);

  // ─── Computed ─────────────────────────────────────────────────────────

  const totalCreateSize = files.reduce((acc, f) => acc + f.size, 0);
  const totalExtractedSize = extractedFiles.reduce((acc, f) => acc + f.size, 0);
  const selectedCount = extractedFiles.filter((f) => f.selected).length;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {/* Tab switcher */}
        <div
          className="inline-flex p-1"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            alignSelf: 'flex-start',
          }}
          role="tablist"
          aria-label="ZIP mode"
        >
          {(
            [
              { id: 'create' as const, label: 'Create ZIP' },
              { id: 'extract' as const, label: 'Extract ZIP' },
            ]
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ─── Create Tab ──────────────────────────────────────────────── */}
        {activeTab === 'create' && (
          <div className="flex flex-col gap-4">
            <FileDropZone
              onDrop={handleAddFiles}
              multiple
              label="Drop files here or click to browse"
              description={
                files.length > 0 ? (
                  <span>
                    {files.length} file{files.length !== 1 ? 's' : ''} added ({formatBytes(totalCreateSize)})
                  </span>
                ) : (
                  'Select files to add to the ZIP archive'
                )
              }
            />

            {/* File list */}
            {files.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {files.length} file{files.length !== 1 ? 's' : ''} ({formatBytes(totalCreateSize)})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFiles}
                    disabled={creating}
                  >
                    Clear all
                  </Button>
                </div>

                <div
                  className="flex flex-col gap-1 overflow-y-auto"
                  style={{
                    maxHeight: '300px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {files.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 px-3 py-2"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <FileText
                        className="h-4 w-4 shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span
                          className="truncate text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {entry.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {formatBytes(entry.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.name}`}
                        onClick={() => handleRemoveFile(entry.id)}
                        disabled={creating}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCreateZip}
                  disabled={files.length === 0 || creating}
                  loading={creating}
                  leadingIcon={
                    !creating ? <Archive className="h-4 w-4" /> : undefined
                  }
                >
                  {creating
                    ? 'Creating...'
                    : `Create ZIP (${files.length} file${files.length !== 1 ? 's' : ''})`}
                </Button>
              </div>
            )}

            {/* Empty state */}
            {files.length === 0 && (
              <div
                className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
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
                  <Archive className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No files added yet
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Drop files above or click to browse.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Extract Tab ─────────────────────────────────────────────── */}
        {activeTab === 'extract' && (
          <div className="flex flex-col gap-4">
            <FileDropZone
              onDrop={handleDropZip}
              accept={['.zip', 'application/zip', 'application/x-zip-compressed']}
              multiple={false}
              label="Drop a ZIP file here or click to browse"
              description={
                zipName ? (
                  <span>
                    Current file: <strong>{zipName}</strong>
                  </span>
                ) : (
                  'Select a .zip file to extract'
                )
              }
            />

            {/* Extracting indicator */}
            {extracting && (
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Loader2
                  className="h-4 w-4 tb-anim-spin"
                  style={{ color: 'var(--accent)' }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Extracting...
                </span>
              </div>
            )}

            {/* Extracted file list */}
            {extractedFiles.length > 0 && !extracting && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {extractedFiles.length} file{extractedFiles.length !== 1 ? 's' : ''}
                    {' '}({formatBytes(totalExtractedSize)})
                    {selectedCount > 0 && (
                      <span style={{ color: 'var(--accent)' }}>
                        {' '}&middot; {selectedCount} selected
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearExtracted}
                  >
                    Clear
                  </Button>
                </div>

                <div
                  className="flex flex-col gap-1 overflow-y-auto"
                  style={{
                    maxHeight: '360px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {extractedFiles.map((entry, index) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-3 px-3 py-2 transition-colors"
                      style={{
                        backgroundColor: entry.selected
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-secondary)',
                        border: `1px solid ${
                          entry.selected
                            ? 'var(--accent)'
                            : 'var(--border-primary)'
                        }`,
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleFileSelection(index)}
                      role="checkbox"
                      aria-checked={entry.selected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleFileSelection(index);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleFileSelection(index)}
                        className="shrink-0"
                        aria-label={`Select ${entry.name}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span
                          className="truncate text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {entry.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {formatBytes(entry.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Download ${entry.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(entry);
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleExtractAll}
                    leadingIcon={<Download className="h-4 w-4" />}
                  >
                    Extract All ({extractedFiles.length})
                  </Button>
                  {selectedCount > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={handleExtractSelected}
                      leadingIcon={<Download className="h-4 w-4" />}
                    >
                      Extract Selected ({selectedCount})
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {extractedFiles.length === 0 && !extracting && !zipName && (
              <div
                className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
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
                  <Archive className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    No ZIP file loaded
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Drop a .zip file above to view and extract its contents.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default ZipTool;
