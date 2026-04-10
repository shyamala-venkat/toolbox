import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Regex as RegexIcon } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { meta } from './meta';
import RegexWorker from './regex.worker?worker';
import type { MatchResult, RegexMode, RegexRequest, RegexResponse } from './regex.worker';

// ─── Types & defaults ───────────────────────────────────────────────────────

type Flag = 'g' | 'i' | 'm' | 's' | 'u' | 'y';
const ALL_FLAGS: readonly Flag[] = ['g', 'i', 'm', 's', 'u', 'y'];

const FLAG_TOOLTIPS: Record<Flag, string> = {
  g: 'global — find all matches',
  i: 'insensitive — case-insensitive',
  m: 'multiline — ^ and $ match per-line',
  s: 'dotAll — . matches newlines',
  u: 'unicode',
  y: 'sticky',
};

interface RegexTesterDefaults {
  pattern: string;
  flags: string;
  mode: RegexMode;
}

const DEFAULTS: RegexTesterDefaults = {
  pattern: '',
  flags: 'g',
  mode: 'match',
};

const WORKER_TIMEOUT_MS = 5000;

// ─── Common patterns library ────────────────────────────────────────────────

interface PatternEntry {
  label: string;
  pattern: string;
  flags: string;
}

const PATTERN_LIBRARY: readonly PatternEntry[] = [
  { label: 'Email', pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', flags: 'g' },
  { label: 'URL (http/https)', pattern: 'https?://[^\\s<>"\']+', flags: 'g' },
  { label: 'IPv4 address', pattern: '\\b(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)(?:\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)){3}\\b', flags: 'g' },
  { label: 'IPv6 address', pattern: '(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}', flags: 'g' },
  { label: 'UUID', pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', flags: 'g' },
  { label: 'ISO 8601 date', pattern: '\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)?', flags: 'g' },
  { label: 'Hex color', pattern: '#(?:[A-Fa-f0-9]{3}){1,2}\\b', flags: 'g' },
  { label: 'US phone number', pattern: '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}', flags: 'g' },
  { label: 'US ZIP code', pattern: '\\b\\d{5}(?:-\\d{4})?\\b', flags: 'g' },
  { label: 'Slug', pattern: '[a-z0-9]+(?:-[a-z0-9]+)*', flags: 'g' },
  { label: 'Markdown link', pattern: '\\[([^\\]]+)\\]\\(([^)]+)\\)', flags: 'g' },
  { label: 'Semver', pattern: '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?', flags: 'g' },
  { label: 'Credit card (loose)', pattern: '\\b\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}\\b', flags: 'g' },
  { label: 'HTML tag', pattern: '<\\/?[a-zA-Z][^>]*>', flags: 'g' },
  { label: 'Whitespace', pattern: '\\s+', flags: 'g' },
];

// ─── Persistence ────────────────────────────────────────────────────────────

// Validate flags to whatever the browser actually understands. We filter to
// the known set so a corrupt preferences file can't inject arbitrary chars.
const normalizeFlags = (raw: string): string => {
  const seen = new Set<string>();
  let out = '';
  for (const ch of raw) {
    if ((ALL_FLAGS as readonly string[]).includes(ch) && !seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
};

const isRegexMode = (v: unknown): v is RegexMode =>
  v === 'match' || v === 'replace' || v === 'split';

// Enforce a small cap on the persisted pattern so the 64KB tool_defaults
// ceiling can't be blown by pasting a megabyte of text here.
const MAX_PERSISTED_PATTERN = 512;

const sanitizeRegexTesterDefaults = (raw: unknown): RegexTesterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const rawPattern = obj.pattern;
  const pattern =
    typeof rawPattern === 'string'
      ? rawPattern.slice(0, MAX_PERSISTED_PATTERN)
      : DEFAULTS.pattern;
  const rawFlags = obj.flags;
  const flags =
    typeof rawFlags === 'string'
      ? normalizeFlags(rawFlags)
      : DEFAULTS.flags;
  return {
    pattern,
    flags,
    mode: isRegexMode(obj.mode) ? obj.mode : DEFAULTS.mode,
  };
};

// ─── Worker runner ──────────────────────────────────────────────────────────

interface WorkerHandle {
  worker: Worker;
  promise: Promise<RegexResponse>;
}

// Spin up a fresh worker per execution and return BOTH the worker handle and
// the promise. The caller is expected to track the handle so it can terminate
// any in-flight worker before launching a new one — otherwise rapid input
// against a catastrophic pattern accumulates concurrent workers up to the
// timeout window. Workers always self-terminate on resolve/reject/timeout;
// external `.terminate()` is the override for the "user typed faster" case.
const runInWorker = (req: RegexRequest): WorkerHandle => {
  const worker = new RegexWorker();
  const promise = new Promise<RegexResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          'Regex execution timed out (possible catastrophic backtracking).',
        ),
      );
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<RegexResponse>) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(e.message || 'Worker execution failed'));
    };

    worker.postMessage(req);
  });
  return { worker, promise };
};

// ─── Match highlighting ─────────────────────────────────────────────────────

interface HighlightSegment {
  text: string;
  matched: boolean;
}

const buildHighlightSegments = (
  input: string,
  matches: MatchResult[],
): HighlightSegment[] => {
  if (matches.length === 0) return [{ text: input, matched: false }];
  // Sort by index and clip overlaps defensively (matches shouldn't overlap,
  // but `y` flag edge cases could produce zero-width results).
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.index < cursor) continue; // overlap — skip
    if (m.index > cursor) {
      segments.push({ text: input.slice(cursor, m.index), matched: false });
    }
    if (m.match.length > 0) {
      segments.push({ text: m.match, matched: true });
      cursor = m.index + m.match.length;
    } else {
      // Zero-width match — advance by one so we don't loop forever.
      cursor = m.index + 1;
    }
  }
  if (cursor < input.length) {
    segments.push({ text: input.slice(cursor), matched: false });
  }
  return segments;
};

// ─── Component ──────────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: RegexMode; label: string }[] = [
  { value: 'match', label: 'Match' },
  { value: 'replace', label: 'Replace' },
  { value: 'split', label: 'Split' },
];

interface RunState {
  status: 'idle' | 'running' | 'ok' | 'error';
  error: string | null;
  matches: MatchResult[];
  replaceResult: string;
  splitResult: string[];
}

const INITIAL_STATE: RunState = {
  status: 'idle',
  error: null,
  matches: [],
  replaceResult: '',
  splitResult: [],
};

function RegexTester() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial: RegexTesterDefaults = useMemo(
    () => sanitizeRegexTesterDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [pattern, setPattern] = useState<string>(initial.pattern);
  const [flags, setFlags] = useState<string>(initial.flags);
  const [mode, setMode] = useState<RegexMode>(initial.mode);
  const [input, setInput] = useState<string>('');
  const [replacement, setReplacement] = useState<string>('');
  const [run, setRun] = useState<RunState>(INITIAL_STATE);

  // Persist after first render. We persist the pattern+flags+mode but cap the
  // pattern at 512 chars to keep us well under the 64 KB preferences ceiling.
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
        [meta.id]: {
          pattern: pattern.slice(0, MAX_PERSISTED_PATTERN),
          flags,
          mode,
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, flags, mode]);

  const debouncedPattern = useDebounce(pattern, 200);
  const debouncedInput = useDebounce(input, 200);
  const debouncedReplacement = useDebounce(replacement, 200);

  const requestIdRef = useRef(0);
  // Holds the worker for the most recently dispatched execution. We terminate
  // it before spinning up the next one so fast typing against a catastrophic
  // regex can never accumulate more than one concurrent worker.
  const currentWorkerRef = useRef<Worker | null>(null);

  // Belt-and-braces: terminate any in-flight worker on unmount.
  useEffect(
    () => () => {
      currentWorkerRef.current?.terminate();
      currentWorkerRef.current = null;
    },
    [],
  );

  // Execute the regex in a worker whenever inputs change.
  useEffect(() => {
    if (debouncedPattern.length === 0) {
      currentWorkerRef.current?.terminate();
      currentWorkerRef.current = null;
      setRun(INITIAL_STATE);
      return;
    }

    const myId = ++requestIdRef.current;
    setRun((prev) => ({ ...prev, status: 'running', error: null }));

    // Kill any in-flight worker before launching the next one. Without this,
    // a fast-typing user against a catastrophic pattern can accumulate one
    // worker per keystroke, each living up to WORKER_TIMEOUT_MS.
    currentWorkerRef.current?.terminate();

    const handle = runInWorker({
      id: myId,
      pattern: debouncedPattern,
      flags,
      mode,
      input: debouncedInput,
      ...(mode === 'replace' ? { replacement: debouncedReplacement } : {}),
    });
    currentWorkerRef.current = handle.worker;

    handle.promise
      .then((res) => {
        if (requestIdRef.current !== myId) return;
        if (!res.ok) {
          setRun({
            status: 'error',
            error: res.error,
            matches: [],
            replaceResult: '',
            splitResult: [],
          });
          return;
        }
        if (res.mode === 'match') {
          setRun({
            status: 'ok',
            error: null,
            matches: res.result as MatchResult[],
            replaceResult: '',
            splitResult: [],
          });
        } else if (res.mode === 'replace') {
          setRun({
            status: 'ok',
            error: null,
            matches: [],
            replaceResult: res.result as string,
            splitResult: [],
          });
        } else {
          setRun({
            status: 'ok',
            error: null,
            matches: [],
            replaceResult: '',
            splitResult: res.result as string[],
          });
        }
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== myId) return;
        const message = err instanceof Error ? err.message : 'Worker execution failed';
        setRun({
          status: 'error',
          error: message,
          matches: [],
          replaceResult: '',
          splitResult: [],
        });
      });
  }, [debouncedPattern, flags, mode, debouncedInput, debouncedReplacement]);

  const toggleFlag = useCallback((flag: Flag): void => {
    setFlags((prev) => {
      if (prev.includes(flag)) {
        return prev.replace(flag, '');
      }
      return normalizeFlags(prev + flag);
    });
  }, []);

  const applyLibraryPattern = useCallback((entry: PatternEntry): void => {
    setPattern(entry.pattern);
    setFlags(normalizeFlags(entry.flags));
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  const modeTabs = (
    <div
      role="tablist"
      aria-label="Regex mode"
      className="inline-flex p-0.5"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {MODE_OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(opt.value)}
            className="px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const flagBadges = (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label="Regex flags"
    >
      {ALL_FLAGS.map((f) => {
        const active = flags.includes(f);
        return (
          <button
            key={f}
            type="button"
            onClick={() => toggleFlag(f)}
            title={FLAG_TOOLTIPS[f]}
            aria-pressed={active}
            aria-label={`Flag ${f}: ${FLAG_TOOLTIPS[f]}`}
            className="mono flex h-7 w-7 items-center justify-center text-xs font-semibold transition-colors"
            style={{
              backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-primary)',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-primary)'}`,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {f}
          </button>
        );
      })}
    </div>
  );

  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!libraryOpen) return;
    const handleClick = (e: MouseEvent): void => {
      if (libraryRef.current && !libraryRef.current.contains(e.target as Node)) {
        setLibraryOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLibraryOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [libraryOpen]);

  const libraryPicker = (
    <div ref={libraryRef} className="relative">
      <button
        type="button"
        onClick={() => setLibraryOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-sm)',
        }}
        aria-haspopup="listbox"
        aria-expanded={libraryOpen}
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Library
      </button>
      {libraryOpen && (
        <div
          className="absolute right-0 top-full z-10 mt-1 max-h-[360px] w-60 overflow-auto py-1"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }}
          role="listbox"
          aria-label="Common regex patterns"
        >
          {PATTERN_LIBRARY.map((entry) => (
            <button
              key={entry.label}
              type="button"
              onClick={() => {
                applyLibraryPattern(entry);
                setLibraryOpen(false);
              }}
              className="tb-cp-row flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors"
              style={{ color: 'var(--text-primary)' }}
              role="option"
              aria-selected={false}
            >
              <span className="text-xs font-medium">{entry.label}</span>
              <span
                className="mono truncate text-[11px]"
                style={{ color: 'var(--text-tertiary)', maxWidth: '100%' }}
                title={entry.pattern}
              >
                /{entry.pattern}/{entry.flags}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const patternPanel = (
    <div
      className="mb-4 flex flex-col gap-3 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {modeTabs}
        {flagBadges}
        <div className="ml-auto">{libraryPicker}</div>
      </div>
      <Input
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="Regular expression…"
        className="mono"
        spellCheck={false}
        aria-label="Regex pattern"
        leadingIcon={<RegexIcon className="h-4 w-4" />}
      />
      {mode === 'replace' && (
        <Input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replacement (use $1, $2, $<name> for groups)…"
          className="mono"
          spellCheck={false}
          aria-label="Replacement string"
        />
      )}
    </div>
  );

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="regex-input"
        className="text-xs font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        Test string
      </label>
      <Textarea
        id="regex-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type or paste text to test against…"
        monospace
        rows={10}
        spellCheck={false}
        aria-label="Test input"
      />
    </div>
  );

  // ─── Output variants ─────────────────────────────────────────────────────

  const highlightSegments = useMemo(
    () => (run.status === 'ok' && mode === 'match' ? buildHighlightSegments(debouncedInput, run.matches) : null),
    [run.status, mode, run.matches, debouncedInput],
  );

  const matchOutput =
    mode !== 'match' ? null : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Highlighted input
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {run.matches.length} {run.matches.length === 1 ? 'match' : 'matches'}
            </span>
          </div>
          <div
            className="mono whitespace-pre-wrap break-words p-3 text-sm leading-6"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              minHeight: '80px',
              color: 'var(--text-primary)',
            }}
            aria-live="polite"
          >
            {debouncedInput.length === 0 ? (
              <span style={{ color: 'var(--text-tertiary)' }}>
                Enter a test string to see matches.
              </span>
            ) : highlightSegments && highlightSegments.length > 0 ? (
              highlightSegments.map((seg, idx) =>
                seg.matched ? (
                  <span key={idx} className="tb-diff-added">
                    {seg.text}
                  </span>
                ) : (
                  <span key={idx}>{seg.text}</span>
                ),
              )
            ) : (
              <span>{debouncedInput}</span>
            )}
          </div>
        </div>

        {run.matches.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Match details
            </span>
            <ul
              className="flex max-h-[360px] flex-col overflow-auto"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {run.matches.map((m, idx) => (
                <li
                  key={idx}
                  className="flex flex-col gap-1 px-3 py-2"
                  style={{
                    borderBottom:
                      idx === run.matches.length - 1
                        ? 'none'
                        : '1px solid var(--border-secondary)',
                  }}
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span
                      className="mono shrink-0"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      #{idx + 1} @ {m.index}
                    </span>
                    <code
                      className="mono truncate"
                      style={{ color: 'var(--text-primary)' }}
                      title={m.match}
                    >
                      {m.match || '(empty)'}
                    </code>
                  </div>
                  {m.captures.length > 0 && (
                    <div
                      className="flex flex-wrap gap-2 text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {m.captures.map((cap, i) => (
                        <span key={i} className="mono">
                          ${i + 1}:{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {cap || '(empty)'}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  {m.groups && Object.keys(m.groups).length > 0 && (
                    <div
                      className="flex flex-wrap gap-2 text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {Object.entries(m.groups).map(([name, value]) => (
                        <span key={name} className="mono">
                          &lt;{name}&gt;:{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {value || '(empty)'}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );

  const replaceOutput =
    mode !== 'replace' ? null : (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Result
        </span>
        <div
          className="mono whitespace-pre-wrap break-words p-3 text-sm leading-6"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            minHeight: '120px',
            color: 'var(--text-primary)',
          }}
          aria-live="polite"
        >
          {run.status === 'ok' ? (
            run.replaceResult.length > 0 ? (
              run.replaceResult
            ) : (
              <span style={{ color: 'var(--text-tertiary)' }}>(empty)</span>
            )
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>
              Enter a pattern and test string to run a replacement.
            </span>
          )}
        </div>
      </div>
    );

  const splitOutput =
    mode !== 'split' ? null : (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Parts
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {run.splitResult.length} {run.splitResult.length === 1 ? 'part' : 'parts'}
          </span>
        </div>
        <ol
          className="flex max-h-[360px] flex-col overflow-auto"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {run.splitResult.length === 0 && (
            <li className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Enter a pattern and test string to see the split result.
            </li>
          )}
          {run.splitResult.map((part, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 px-3 py-1.5"
              style={{
                borderBottom:
                  idx === run.splitResult.length - 1
                    ? 'none'
                    : '1px solid var(--border-secondary)',
              }}
            >
              <span
                className="mono w-8 shrink-0 text-right text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {idx}
              </span>
              <code
                className="mono whitespace-pre-wrap break-words text-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                {part || '(empty)'}
              </code>
            </li>
          ))}
        </ol>
      </div>
    );

  const errorPanel = run.status === 'error' && run.error && (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--radius-md)',
      }}
      role="alert"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: 'var(--danger)' }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
          Regex error
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {run.error}
        </p>
      </div>
    </div>
  );

  const statusBadge = run.status === 'running' && debouncedPattern.length > 0 && (
    <span
      className={cn('text-xs')}
      style={{ color: 'var(--text-tertiary)' }}
      aria-live="polite"
    >
      Running…
    </span>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {patternPanel}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {inputPanel}
          <div className="flex justify-end">{statusBadge}</div>
        </div>
        <div className="flex flex-col gap-3">
          {errorPanel}
          {run.status !== 'error' && (
            <>
              {matchOutput}
              {replaceOutput}
              {splitOutput}
            </>
          )}
        </div>
      </div>
    </ToolPage>
  );
}

export default RegexTester;
