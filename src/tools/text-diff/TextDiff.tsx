import { useEffect, useMemo, useState } from 'react';
import { diffChars, diffLines, diffWords, diffWordsWithSpace, type Change } from 'diff';
import { Diff as DiffIcon } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

type ViewMode = 'side-by-side' | 'unified';
type Granularity = 'lines' | 'words' | 'chars';

interface TextDiffDefaults {
  viewMode: ViewMode;
  granularity: Granularity;
  ignoreWhitespace: boolean;
}

const DEFAULTS: TextDiffDefaults = {
  viewMode: 'side-by-side',
  granularity: 'lines',
  ignoreWhitespace: false,
};

// ─── Persistence ────────────────────────────────────────────────────────────

const isViewMode = (v: unknown): v is ViewMode =>
  v === 'side-by-side' || v === 'unified';

const isGranularity = (v: unknown): v is Granularity =>
  v === 'lines' || v === 'words' || v === 'chars';

const sanitizeTextDiffDefaults = (raw: unknown): TextDiffDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    viewMode: isViewMode(obj.viewMode) ? obj.viewMode : DEFAULTS.viewMode,
    granularity: isGranularity(obj.granularity) ? obj.granularity : DEFAULTS.granularity,
    ignoreWhitespace:
      typeof obj.ignoreWhitespace === 'boolean'
        ? obj.ignoreWhitespace
        : DEFAULTS.ignoreWhitespace,
  };
};

const VIEW_OPTIONS = [
  { value: 'side-by-side', label: 'Side by side' },
  { value: 'unified', label: 'Unified' },
];

const GRAN_OPTIONS = [
  { value: 'lines', label: 'Lines' },
  { value: 'words', label: 'Words' },
  { value: 'chars', label: 'Characters' },
];

// ─── Diff computation ───────────────────────────────────────────────────────

interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

const computeStats = (changes: Change[]): DiffStats => {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const c of changes) {
    const count = c.count ?? c.value.split('').length;
    if (c.added) added += count;
    else if (c.removed) removed += count;
    else unchanged += count;
  }
  return { added, removed, unchanged };
};

const runDiff = (
  a: string,
  b: string,
  granularity: Granularity,
  ignoreWhitespace: boolean,
): Change[] => {
  switch (granularity) {
    case 'lines':
      return diffLines(a, b, { ignoreWhitespace });
    case 'words':
      // `diffWords` already ignores whitespace; `diffWordsWithSpace` treats
      // whitespace as meaningful — pick based on the toggle.
      return ignoreWhitespace ? diffWords(a, b) : diffWordsWithSpace(a, b);
    case 'chars':
      // `diffChars` has no whitespace option — it always treats whitespace
      // as significant, which is the only sensible behavior at char level.
      return diffChars(a, b);
  }
};

// Split an in-line diff chunk (trailing newline included for line mode) into
// its constituent rows so we can render a proper line-by-line gutter.
const splitIntoLines = (value: string): string[] => {
  if (value.length === 0) return [];
  const stripped = value.endsWith('\n') ? value.slice(0, -1) : value;
  return stripped.split('\n');
};

// ─── Side-by-side builder ───────────────────────────────────────────────────

interface SbsRow {
  kind: 'equal' | 'added' | 'removed' | 'modified' | 'blank-left' | 'blank-right';
  left: string | null;
  right: string | null;
}

/**
 * Convert a line-level diff into paired rows for the side-by-side view.
 * Consecutive add/remove chunks are zipped together so they appear on the
 * same row when possible.
 */
const buildSideBySide = (changes: Change[]): SbsRow[] => {
  const rows: SbsRow[] = [];
  let i = 0;
  while (i < changes.length) {
    const c = changes[i]!;
    if (!c.added && !c.removed) {
      for (const line of splitIntoLines(c.value)) {
        rows.push({ kind: 'equal', left: line, right: line });
      }
      i += 1;
      continue;
    }

    // Collect the next consecutive removed + added chunks (either order).
    const removedLines: string[] = [];
    const addedLines: string[] = [];
    while (i < changes.length) {
      const cur = changes[i]!;
      if (cur.removed) {
        removedLines.push(...splitIntoLines(cur.value));
        i += 1;
      } else if (cur.added) {
        addedLines.push(...splitIntoLines(cur.value));
        i += 1;
      } else {
        break;
      }
    }

    const maxLen = Math.max(removedLines.length, addedLines.length);
    for (let j = 0; j < maxLen; j += 1) {
      const left = j < removedLines.length ? removedLines[j]! : null;
      const right = j < addedLines.length ? addedLines[j]! : null;
      if (left !== null && right !== null) {
        rows.push({ kind: 'modified', left, right });
      } else if (left !== null) {
        rows.push({ kind: 'removed', left, right: null });
      } else if (right !== null) {
        rows.push({ kind: 'added', left: null, right });
      }
    }
  }
  return rows;
};

// ─── Inline renderer (for word/char granularity) ────────────────────────────

function InlineDiff({ changes }: { changes: Change[] }) {
  return (
    <div
      className="mono whitespace-pre-wrap break-words p-4 text-sm leading-6"
      style={{ color: 'var(--text-primary)' }}
    >
      {changes.map((c, idx) => {
        if (c.added) {
          return (
            <span key={idx} className="tb-diff-added">
              {c.value}
            </span>
          );
        }
        if (c.removed) {
          return (
            <span
              key={idx}
              className="tb-diff-removed"
              style={{ textDecoration: 'line-through', textDecorationThickness: '1px' }}
            >
              {c.value}
            </span>
          );
        }
        return <span key={idx}>{c.value}</span>;
      })}
    </div>
  );
}

// ─── Unified line view ──────────────────────────────────────────────────────

interface UnifiedRow {
  kind: 'equal' | 'added' | 'removed';
  content: string;
}

const buildUnifiedRows = (changes: Change[]): UnifiedRow[] => {
  const rows: UnifiedRow[] = [];
  for (const c of changes) {
    const kind: UnifiedRow['kind'] = c.added ? 'added' : c.removed ? 'removed' : 'equal';
    for (const line of splitIntoLines(c.value)) {
      rows.push({ kind, content: line });
    }
  }
  return rows;
};

function UnifiedDiff({ rows }: { rows: UnifiedRow[] }) {
  return (
    <div
      className="mono text-sm"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {rows.map((row, idx) => {
        const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
        const rowClass =
          row.kind === 'added'
            ? 'tb-diff-added'
            : row.kind === 'removed'
              ? 'tb-diff-removed'
              : '';
        const gutterClass =
          row.kind === 'added'
            ? 'tb-diff-gutter-added'
            : row.kind === 'removed'
              ? 'tb-diff-gutter-removed'
              : '';
        return (
          <div
            key={idx}
            className={cn('flex items-start gap-3 px-3 py-0.5 leading-6', rowClass)}
          >
            <span
              aria-hidden="true"
              className={cn('mono w-4 shrink-0 select-none text-center', gutterClass)}
              style={{ color: row.kind === 'equal' ? 'var(--text-muted)' : undefined }}
            >
              {prefix}
            </span>
            <span className="whitespace-pre-wrap break-words">{row.content || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Side-by-side view ──────────────────────────────────────────────────────

function SideBySideDiff({ rows }: { rows: SbsRow[] }) {
  return (
    <div
      className="mono grid grid-cols-2 gap-0 text-sm"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
      role="table"
      aria-label="Side by side diff"
    >
      {rows.map((row, idx) => {
        const leftClass =
          row.kind === 'removed' || row.kind === 'modified'
            ? 'tb-diff-removed'
            : row.kind === 'added'
              ? 'tb-diff-placeholder'
              : '';
        const rightClass =
          row.kind === 'added' || row.kind === 'modified'
            ? 'tb-diff-added'
            : row.kind === 'removed'
              ? 'tb-diff-placeholder'
              : '';
        return (
          <div key={idx} className="contents" role="row">
            <div
              className={cn(
                'whitespace-pre-wrap break-words px-3 py-0.5 leading-6',
                leftClass,
              )}
              style={{ borderRight: '1px solid var(--border-secondary)' }}
              role="cell"
            >
              {row.left ?? '\u00a0'}
            </div>
            <div
              className={cn('whitespace-pre-wrap break-words px-3 py-0.5 leading-6', rightClass)}
              role="cell"
            >
              {row.right ?? '\u00a0'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function TextDiff() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial: TextDiffDefaults = useMemo(
    () => sanitizeTextDiffDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [original, setOriginal] = useState<string>('');
  const [changed, setChanged] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(initial.viewMode);
  const [granularity, setGranularity] = useState<Granularity>(initial.granularity);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(initial.ignoreWhitespace);

  // Persist after first render.
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
        [meta.id]: { viewMode, granularity, ignoreWhitespace },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, granularity, ignoreWhitespace]);

  const debouncedOriginal = useDebounce(original, 200);
  const debouncedChanged = useDebounce(changed, 200);

  const changes = useMemo(
    () => runDiff(debouncedOriginal, debouncedChanged, granularity, ignoreWhitespace),
    [debouncedOriginal, debouncedChanged, granularity, ignoreWhitespace],
  );

  const stats = useMemo(() => computeStats(changes), [changes]);

  const unifiedRows = useMemo(
    () => (granularity === 'lines' ? buildUnifiedRows(changes) : []),
    [changes, granularity],
  );

  const sbsRows = useMemo(
    () => (granularity === 'lines' ? buildSideBySide(changes) : []),
    [changes, granularity],
  );

  const hasInput = debouncedOriginal.length > 0 || debouncedChanged.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  const optionsPanel = (
    <div
      className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="w-44">
        <Select
          label="View"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
          options={VIEW_OPTIONS}
        />
      </div>
      <div className="w-40">
        <Select
          label="Granularity"
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
          options={GRAN_OPTIONS}
        />
      </div>
      <div className="flex items-center pb-2">
        <Toggle
          checked={ignoreWhitespace}
          onChange={setIgnoreWhitespace}
          label="Ignore whitespace"
        />
      </div>

      {hasInput && (
        <div className="ml-auto flex items-center gap-3 pb-1">
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--success)' }}
          >
            +{stats.added}
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            −{stats.removed}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {stats.unchanged} unchanged
          </span>
        </div>
      )}
    </div>
  );

  const inputsPanel = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Textarea
        label="Original"
        value={original}
        onChange={(e) => setOriginal(e.target.value)}
        placeholder="Paste the original text…"
        monospace
        rows={10}
        spellCheck={false}
        aria-label="Original text"
      />
      <Textarea
        label="Changed"
        value={changed}
        onChange={(e) => setChanged(e.target.value)}
        placeholder="Paste the changed text…"
        monospace
        rows={10}
        spellCheck={false}
        aria-label="Changed text"
      />
    </div>
  );

  const diffPanel = (() => {
    if (!hasInput) {
      return (
        <div
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
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
            <DiffIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              No diff yet
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Paste two text snippets to compare.
            </p>
          </div>
        </div>
      );
    }

    const container = (
      <div
        className="overflow-auto"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          maxHeight: '560px',
        }}
      >
        {granularity === 'lines' ? (
          viewMode === 'side-by-side' ? (
            <SideBySideDiff rows={sbsRows} />
          ) : (
            <UnifiedDiff rows={unifiedRows} />
          )
        ) : (
          <InlineDiff changes={changes} />
        )}
      </div>
    );

    return container;
  })();

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsPanel}
      <div className="flex flex-col gap-6">
        {inputsPanel}
        {diffPanel}
      </div>
    </ToolPage>
  );
}

export default TextDiff;
