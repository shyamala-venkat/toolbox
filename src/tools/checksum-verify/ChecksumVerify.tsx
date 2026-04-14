import { useCallback, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CopyButton } from '@/components/ui/CopyButton';
import { useAppStore } from '@/stores/appStore';
import { hashFile, statFile, type HashAlgorithm } from '@/lib/tauri';
import { formatBytes } from '@/lib/utils';
import { meta, detectAlgorithm, VERIFY_ALGORITHMS, type AlgorithmInfo } from './meta';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_HASH_FILE_BYTES = 100 * 1024 * 1024;

// ─── Types ──────────────────────────────────────────────────────────────────

interface SelectedFile {
  path: string;
  name: string;
  size: number;
}

type VerifyResult =
  | { kind: 'idle' }
  | { kind: 'computing' }
  | { kind: 'match'; algorithm: string; computed: string }
  | { kind: 'mismatch'; algorithm: string; computed: string }
  | { kind: 'error'; message: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('no such file')) return 'File not found';
  if (lower.includes('permission denied')) return 'Permission denied \u2014 cannot read this file';
  if (lower.includes('exceeds max hash size')) return 'File is too large (max 100 MB)';
  if (lower.includes('invalid file path') || lower.includes('path is not allowed')) {
    return 'This file path is not allowed';
  }
  if (lower.includes('is not a regular file')) return 'This is not a regular file';
  return raw.length > 120 ? `${raw.slice(0, 120)}\u2026` : raw;
}

// ─── Component ──────────────────────────────────────────────────────────────

function ChecksumVerify() {
  const showToast = useAppStore((s) => s.showToast);

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [filePicking, setFilePicking] = useState(false);
  const [expectedHash, setExpectedHash] = useState('');
  const [manualAlgorithm, setManualAlgorithm] = useState<AlgorithmInfo | null>(null);
  const [result, setResult] = useState<VerifyResult>({ kind: 'idle' });

  // Detected or manually-selected algorithm
  const detected = detectAlgorithm(expectedHash);
  const activeAlgorithm = manualAlgorithm ?? detected;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleChooseFile = useCallback(async () => {
    if (filePicking) return;
    setFilePicking(true);
    try {
      const selected = await open({ multiple: false, directory: false });
      if (!selected || typeof selected !== 'string') return;

      let size: number;
      try {
        size = await statFile(selected);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        showToast(friendlyError(raw), 'error');
        return;
      }

      if (size > MAX_HASH_FILE_BYTES) {
        showToast('File is too large (max 100 MB)', 'error');
        return;
      }

      setFile({ path: selected, name: basename(selected), size });
      setResult({ kind: 'idle' });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Could not open file picker';
      showToast(friendlyError(raw), 'error');
    } finally {
      setFilePicking(false);
    }
  }, [filePicking, showToast]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setResult({ kind: 'idle' });
  }, []);

  const handleVerify = useCallback(async () => {
    if (!file || !activeAlgorithm) return;

    setResult({ kind: 'computing' });
    try {
      const computed = await hashFile(file.path, activeAlgorithm.id as HashAlgorithm);
      const expected = expectedHash.trim().toLowerCase();
      const isMatch = computed.toLowerCase() === expected;
      setResult({
        kind: isMatch ? 'match' : 'mismatch',
        algorithm: activeAlgorithm.label,
        computed,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to compute hash';
      setResult({ kind: 'error', message: friendlyError(raw) });
    }
  }, [file, activeAlgorithm, expectedHash]);

  // ─── Render pieces ─────────────────────────────────────────────────────────

  const filePanel = file ? (
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
        <FileText className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
          title={file.name}
        >
          {file.name}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {formatBytes(file.size)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClearFile}
        aria-label="Clear file"
        leadingIcon={<X className="h-4 w-4" />}
      />
    </div>
  ) : (
    <div
      className="flex min-h-[180px] flex-col items-center justify-center gap-4 px-6 py-10 text-center"
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
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Select a file to verify
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Streaming via Rust &middot; 100 MB max
        </p>
      </div>
      <Button type="button" variant="primary" size="sm" onClick={handleChooseFile} loading={filePicking}>
        Choose file...
      </Button>
    </div>
  );

  const hashInput = (
    <div className="flex flex-col gap-3">
      <Input
        label="Expected hash"
        value={expectedHash}
        onChange={(e) => {
          setExpectedHash(e.target.value);
          setManualAlgorithm(null);
          setResult({ kind: 'idle' });
        }}
        placeholder="Paste the expected hash from the download page..."
        aria-label="Expected hash value"
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {activeAlgorithm
            ? `Detected: ${activeAlgorithm.label}`
            : expectedHash.trim().length > 0
              ? 'Unknown hash length'
              : 'Auto-detects MD5, SHA-1, SHA-256, SHA-512'}
        </span>
        {!detected && expectedHash.trim().length > 0 && (
          <div className="flex gap-1.5">
            {VERIFY_ALGORITHMS.map((algo) => (
              <button
                key={algo.id}
                type="button"
                onClick={() => setManualAlgorithm(algo)}
                className="px-2 py-1 text-xs font-medium transition-colors duration-150"
                style={{
                  backgroundColor: manualAlgorithm?.id === algo.id ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  color: manualAlgorithm?.id === algo.id ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${manualAlgorithm?.id === algo.id ? 'var(--accent)' : 'var(--border-primary)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}
                aria-pressed={manualAlgorithm?.id === algo.id}
              >
                {algo.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const resultPanel = result.kind !== 'idle' && result.kind !== 'computing' && (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: `1px solid ${
          result.kind === 'match'
            ? 'var(--success)'
            : result.kind === 'mismatch'
              ? 'var(--danger)'
              : 'var(--border-primary)'
        }`,
        borderRadius: 'var(--radius-md)',
      }}
    >
      {result.kind === 'error' ? (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {result.message}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center"
              style={{
                backgroundColor: result.kind === 'match' ? 'var(--success)' : 'var(--danger)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span className="text-xs font-bold" style={{ color: 'var(--text-inverse)' }}>
                {result.kind === 'match' ? '\u2713' : '\u2717'}
              </span>
            </div>
            <p
              className="text-sm font-medium"
              style={{ color: result.kind === 'match' ? 'var(--success)' : 'var(--danger)' }}
            >
              {result.kind === 'match' ? 'Checksum matches' : 'Checksum does NOT match'}
            </p>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ({result.algorithm})
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Computed hash
            </p>
            <div className="flex items-center gap-2">
              <code
                className="min-w-0 flex-1 break-all text-xs"
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  color: 'var(--text-primary)',
                }}
              >
                {result.computed}
              </code>
              <CopyButton value={result.computed} label="Copy" size="sm" variant="ghost" />
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ─── Main render ───────────────────────────────────────────────────────────

  const canVerify = Boolean(file) && Boolean(activeAlgorithm) && expectedHash.trim().length > 0;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-5">
        {filePanel}

        {file && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleChooseFile}
            loading={filePicking}
          >
            Choose another file...
          </Button>
        )}

        {hashInput}

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleVerify}
          loading={result.kind === 'computing'}
          disabled={!canVerify}
        >
          Verify checksum
        </Button>

        {resultPanel}
      </div>
    </ToolPage>
  );
}

export default ChecksumVerify;
