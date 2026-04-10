import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Type as TypeIcon, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { hashText, hashFile, statFile, type HashAlgorithm } from '@/lib/tauri';
import { formatBytes, cn } from '@/lib/utils';

// Mirror of the Rust-side cap in `commands/crypto.rs`. Keeping this client-side
// lets us reject huge files before the IPC round-trip and show a friendly toast.
const MAX_HASH_FILE_BYTES = 100 * 1024 * 1024;
import { meta, HASH_ALGORITHMS, type HashAlgorithmId } from './meta';
import { AlgorithmPicker } from './AlgorithmPicker';
import { HashResultsPanel } from './HashResultsPanel';
import type { HashRowState } from './HashResultRow';

// Translate raw Rust error strings into friendly, user-facing messages. The
// Rust side can return paths, OS error numbers, and other noise that we don't
// want to leak into the UI; each match here covers one of the known error
// surfaces in `commands/crypto.rs` and `commands/fs.rs`. Anything unrecognized
// is truncated but never logged.
function friendlyHashError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (lower.includes('no such file')) return 'File not found';
  if (lower.includes('permission denied')) return 'Permission denied — cannot read this file';
  if (lower.includes('exceeds max hash size')) return 'File is too large (max 100 MB)';
  if (lower.includes('invalid file path') || lower.includes('path is not allowed')) {
    return 'This file path is not allowed';
  }
  if (lower.includes('is not a regular file')) return 'This is not a regular file';
  if (lower.includes('invalid algorithm')) return 'Unsupported hash algorithm';
  if (lower.includes('exceeds') && lower.includes('text')) return 'Text is too long (max 10 MB)';
  return rawError.length > 120 ? `${rawError.slice(0, 120)}…` : rawError;
}

// ─── Types & defaults ───────────────────────────────────────────────────────

type Mode = 'text' | 'file';

interface HashGeneratorDefaults {
  selectedAlgorithms: HashAlgorithmId[];
}

const DEFAULTS: HashGeneratorDefaults = {
  selectedAlgorithms: HASH_ALGORITHMS.map((a) => a.id),
};

const ALL_IDLE: Record<HashAlgorithmId, HashRowState> = {
  md5: { kind: 'idle' },
  sha1: { kind: 'idle' },
  sha256: { kind: 'idle' },
  sha512: { kind: 'idle' },
  crc32: { kind: 'idle' },
};

interface SelectedFile {
  path: string;
  name: string;
  size: number;
}

// Strip a path down to its last segment, OS-agnostic.
const basename = (path: string): string => {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
};

// Defense-in-depth: a manually edited preferences.json could ship anything
// for our defaults blob. Validate the selected-algorithms array against the
// known set and silently fall back to the hard-coded defaults when the shape
// doesn't match.
const sanitizeHashGeneratorDefaults = (raw: unknown): HashGeneratorDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const candidate = obj.selectedAlgorithms;
  if (Array.isArray(candidate) && candidate.length > 0) {
    const allowed = new Set<HashAlgorithmId>(HASH_ALGORITHMS.map((a) => a.id));
    const filtered = candidate.filter((c): c is HashAlgorithmId =>
      typeof c === 'string' && allowed.has(c as HashAlgorithmId),
    );
    if (filtered.length > 0) return { selectedAlgorithms: filtered };
  }
  return { ...DEFAULTS };
};

// ─── Component ──────────────────────────────────────────────────────────────

function HashGenerator() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here. Zustand
  // compares the returned reference, and `settingsStore.update()` creates a
  // fresh nested object only for the tool that actually changed.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initialAlgorithms = useMemo<HashAlgorithmId[]>(
    () => sanitizeHashGeneratorDefaults(stored).selectedAlgorithms,
    // Read once on mount — later changes are pushed via the persist effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState<string>('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [selectedAlgorithms, setSelectedAlgorithms] =
    useState<HashAlgorithmId[]>(initialAlgorithms);
  const [results, setResults] = useState<Record<HashAlgorithmId, HashRowState>>(ALL_IDLE);
  const [filePicking, setFilePicking] = useState(false);

  const debouncedText = useDebounce(text, 300);

  // Persist selected algorithms after the first mount snapshot. We read
  // `toolDefaults` from the live store via `getState()` so we don't have to
  // subscribe to the whole map — that would cause a re-render whenever any
  // other tool updates its own slice.
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
        [meta.id]: { selectedAlgorithms },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlgorithms]);

  // ─── Hashing — text mode ───────────────────────────────────────────────────
  //
  // We track the current request "epoch" via a ref so a fast-typing user
  // doesn't see stale results when an in-flight request resolves after a
  // newer one has started.

  const textEpochRef = useRef(0);

  useEffect(() => {
    if (mode !== 'text') return;

    if (debouncedText.length === 0) {
      setResults(ALL_IDLE);
      return;
    }
    if (selectedAlgorithms.length === 0) {
      setResults(ALL_IDLE);
      return;
    }

    const myEpoch = ++textEpochRef.current;

    setResults((prev) => {
      const next = { ...prev };
      for (const algo of HASH_ALGORITHMS) {
        next[algo.id] = selectedAlgorithms.includes(algo.id)
          ? { kind: 'loading' }
          : { kind: 'idle' };
      }
      return next;
    });

    const runOne = async (algo: HashAlgorithmId): Promise<void> => {
      try {
        const digest = await hashText(debouncedText, algo as HashAlgorithm);
        if (textEpochRef.current !== myEpoch) return;
        setResults((prev) => ({ ...prev, [algo]: { kind: 'ok', digest } }));
      } catch (err) {
        if (textEpochRef.current !== myEpoch) return;
        const raw = err instanceof Error ? err.message : 'Failed to compute hash';
        setResults((prev) => ({
          ...prev,
          [algo]: { kind: 'error', message: friendlyHashError(raw) },
        }));
      }
    };

    for (const algo of selectedAlgorithms) {
      void runOne(algo);
    }
  }, [debouncedText, selectedAlgorithms, mode]);

  // ─── Hashing — file mode ───────────────────────────────────────────────────

  const fileEpochRef = useRef(0);

  const computeFileHashes = useCallback(
    (target: SelectedFile, algos: HashAlgorithmId[]) => {
      if (algos.length === 0) {
        setResults(ALL_IDLE);
        return;
      }

      const myEpoch = ++fileEpochRef.current;

      setResults((prev) => {
        const next = { ...prev };
        for (const algo of HASH_ALGORITHMS) {
          next[algo.id] = algos.includes(algo.id)
            ? { kind: 'loading' }
            : { kind: 'idle' };
        }
        return next;
      });

      const runOne = async (algo: HashAlgorithmId): Promise<void> => {
        try {
          const digest = await hashFile(target.path, algo as HashAlgorithm);
          if (fileEpochRef.current !== myEpoch) return;
          setResults((prev) => ({ ...prev, [algo]: { kind: 'ok', digest } }));
        } catch (err) {
          if (fileEpochRef.current !== myEpoch) return;
          const raw = err instanceof Error ? err.message : String(err);
          // Surface a friendly summary; never expose raw paths or stack traces.
          setResults((prev) => ({
            ...prev,
            [algo]: { kind: 'error', message: friendlyHashError(raw) },
          }));
        }
      };

      for (const algo of algos) {
        void runOne(algo);
      }
    },
    [],
  );

  // Re-run when algorithms change while a file is selected.
  useEffect(() => {
    if (mode !== 'file' || !file) return;
    computeFileHashes(file, selectedAlgorithms);
  }, [mode, file, selectedAlgorithms, computeFileHashes]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleModeChange = (next: Mode): void => {
    if (next === mode) return;
    setMode(next);
    setResults(ALL_IDLE);
    fileEpochRef.current += 1;
    textEpochRef.current += 1;
  };

  const handleClearText = (): void => {
    setText('');
    setResults(ALL_IDLE);
  };

  const handleChooseFile = useCallback(async () => {
    if (filePicking) return;
    setFilePicking(true);
    try {
      const selected = await open({ multiple: false, directory: false });
      if (!selected || typeof selected !== 'string') return;

      // Stat the file via the dedicated IPC so we can show the real size and
      // reject anything above the 100 MB cap before kicking off the hashing
      // round-trip. The Rust side mirrors this cap, but a friendly toast here
      // saves the user a confusing error from a doomed in-flight request.
      let size: number;
      try {
        size = await statFile(selected);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        showToast(friendlyHashError(raw), 'error');
        return;
      }

      if (size > MAX_HASH_FILE_BYTES) {
        showToast('File is too large (max 100 MB)', 'error');
        return;
      }

      const next: SelectedFile = {
        path: selected,
        name: basename(selected),
        size,
      };
      setFile(next);
      computeFileHashes(next, selectedAlgorithms);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Could not open file picker';
      showToast(friendlyHashError(raw), 'error');
    } finally {
      setFilePicking(false);
    }
  }, [filePicking, selectedAlgorithms, computeFileHashes, showToast]);

  const handleClearFile = (): void => {
    setFile(null);
    fileEpochRef.current += 1;
    setResults(ALL_IDLE);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const modeTabs = (
    <div
      role="tablist"
      aria-label="Hash input mode"
      className="inline-flex p-0.5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {(
        [
          { id: 'text', label: 'Text', icon: TypeIcon },
          { id: 'file', label: 'File', icon: FileText },
        ] as const
      ).map((tab) => {
        const isActive = mode === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleModeChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-150',
            )}
            style={{
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {modeTabs}
      <AlgorithmPicker selected={selectedAlgorithms} onChange={setSelectedAlgorithms} />
    </div>
  );

  const textInputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="hash-generator-input"
        >
          Text input
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClearText}
          disabled={text.length === 0}
        >
          Clear
        </Button>
      </div>
      <Textarea
        id="hash-generator-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste text to hash…"
        monospace
        spellCheck={false}
        rows={10}
        aria-label="Text to hash"
      />
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {text.length.toLocaleString()} {text.length === 1 ? 'character' : 'characters'}
      </div>
    </div>
  );

  const fileInputPanel = (
    <div className="flex flex-col gap-3">
      {file ? (
        <>
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
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleChooseFile}
              loading={filePicking}
            >
              Choose another file…
            </Button>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Streaming via Rust · 100 MB max
            </span>
          </div>
        </>
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
              Select a file to hash
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Streaming via Rust · 100 MB max
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleChooseFile}
            loading={filePicking}
          >
            Choose file…
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsBar}
      <div className="flex flex-col gap-6">
        {mode === 'text' ? textInputPanel : fileInputPanel}
        <HashResultsPanel
          selectedAlgorithms={selectedAlgorithms}
          results={results}
        />
      </div>
    </ToolPage>
  );
}

export default HashGenerator;
