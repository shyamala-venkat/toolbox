import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { JsonTreeView } from './JsonTreeView';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type IndentChoice = '2' | '4' | 'tab';
type ViewMode = 'text' | 'tree';

interface JsonFormatterDefaults {
  indent: IndentChoice;
  sortKeys: boolean;
  minify: boolean;
  viewMode: ViewMode;
}

const DEFAULTS: JsonFormatterDefaults = {
  indent: '2',
  sortKeys: false,
  minify: false,
  viewMode: 'text',
};

interface FormatResult {
  output: string;
  parsed: unknown;
  error: string | null;
  errorLine: number | null;
  errorColumn: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const stripBom = (s: string): string =>
  s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
};

const offsetToLineCol = (
  text: string,
  offset: number,
): { line: number; column: number } => {
  let line = 1;
  let column = 1;
  const upper = Math.min(offset, text.length);
  for (let i = 0; i < upper; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
};

const extractErrorLocation = (
  message: string,
  source: string,
): { line: number; column: number } | null => {
  const posMatch = /position\s+(\d+)/i.exec(message);
  if (posMatch && posMatch[1] !== undefined) {
    const offset = Number.parseInt(posMatch[1], 10);
    if (Number.isFinite(offset)) return offsetToLineCol(source, offset);
  }
  const lineMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lineMatch && lineMatch[1] !== undefined && lineMatch[2] !== undefined) {
    return {
      line: Number.parseInt(lineMatch[1], 10),
      column: Number.parseInt(lineMatch[2], 10),
    };
  }
  return null;
};

const formatJson = (
  raw: string,
  indent: IndentChoice,
  sortKeys: boolean,
  minify: boolean,
): FormatResult => {
  const source = stripBom(raw);
  if (source.trim().length === 0) {
    return { output: '', parsed: undefined, error: null, errorLine: null, errorColumn: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const loc = extractErrorLocation(message, source);
    return {
      output: '',
      parsed: undefined,
      error: message,
      errorLine: loc?.line ?? null,
      errorColumn: loc?.column ?? null,
    };
  }
  const value = sortKeys ? sortKeysDeep(parsed) : parsed;
  const indentArg: string | number = minify
    ? 0
    : indent === 'tab'
      ? '\t'
      : Number.parseInt(indent, 10);
  try {
    const output = JSON.stringify(value, null, indentArg);
    return {
      output: output ?? '',
      parsed: value,
      error: null,
      errorLine: null,
      errorColumn: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: '', parsed: undefined, error: message, errorLine: null, errorColumn: null };
  }
};

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

const topLevelCount = (v: unknown): number => {
  if (Array.isArray(v)) return v.length;
  if (v !== null && typeof v === 'object') return Object.keys(v).length;
  return 0;
};

// ─── Persistence ────────────────────────────────────────────────────────────

const isIndentChoice = (value: unknown): value is IndentChoice =>
  value === '2' || value === '4' || value === 'tab';

const isViewMode = (value: unknown): value is ViewMode =>
  value === 'text' || value === 'tree';

const sanitizeJsonFormatterDefaults = (raw: unknown): JsonFormatterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    indent: isIndentChoice(obj.indent) ? obj.indent : DEFAULTS.indent,
    sortKeys: typeof obj.sortKeys === 'boolean' ? obj.sortKeys : DEFAULTS.sortKeys,
    minify: typeof obj.minify === 'boolean' ? obj.minify : DEFAULTS.minify,
    viewMode: isViewMode(obj.viewMode) ? obj.viewMode : DEFAULTS.viewMode,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

function JsonFormatter() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial: JsonFormatterDefaults = useMemo(
    () => sanitizeJsonFormatterDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState<string>('');
  const [indent, setIndent] = useState<IndentChoice>(initial.indent);
  const [sortKeys, setSortKeys] = useState<boolean>(initial.sortKeys);
  const [minify, setMinify] = useState<boolean>(initial.minify);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.viewMode);

  const debouncedInput = useDebounce(input, 150);

  const result = useMemo(
    () => formatJson(debouncedInput, indent, sortKeys, minify),
    [debouncedInput, indent, sortKeys, minify],
  );

  const persistDefaults = useCallback(
    (next: Partial<JsonFormatterDefaults>) => {
      const merged: JsonFormatterDefaults = { indent, sortKeys, minify, viewMode, ...next };
      const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
      update({ toolDefaults: { ...allDefaults, [meta.id]: merged } });
    },
    [indent, sortKeys, minify, viewMode, update],
  );

  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    persistDefaults({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indent, sortKeys, minify, viewMode]);

  const handleClear = useCallback(() => setInput(''), []);

  const inputLines = countLines(input);
  const outputLines = countLines(result.output);
  const inputChars = input.length;
  const outputChars = result.output.length;

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

  // ─── View mode tabs ─────────────────────────────────────────────────────

  const viewModeTabs = (
    <div
      role="tablist"
      aria-label="Output view mode"
      className="inline-flex p-0.5"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {(
        [
          { id: 'text', label: 'Text' },
          { id: 'tree', label: 'Tree' },
        ] as const
      ).map((tab) => {
        const isActive = viewMode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setViewMode(tab.id)}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium transition-colors duration-150"
            style={{
              backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
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

  // ─── Options bar ──────────────────────────────────────────────────────────

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {viewModeTabs}

      {viewMode === 'text' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Indent
            </span>
            <div className="w-24">
              <Select
                aria-label="Indentation"
                value={indent}
                onChange={(e) => setIndent(e.target.value as IndentChoice)}
                options={[
                  { value: '2', label: '2 spaces' },
                  { value: '4', label: '4 spaces' },
                  { value: 'tab', label: 'Tab' },
                ]}
                disabled={minify}
              />
            </div>
          </div>

          <Toggle checked={sortKeys} onChange={setSortKeys} label="Sort keys" />
          <Toggle checked={minify} onChange={setMinify} label="Minify" />
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {isValid && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--success)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Valid JSON
          </span>
        )}
        {hasError && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Invalid JSON
          </span>
        )}
      </div>
    </div>
  );

  // ─── Input panel ──────────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="json-formatter-input"
        >
          Input
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={input.length === 0}>
          Clear
        </Button>
      </div>
      <Textarea
        id="json-formatter-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='Paste JSON here, e.g. {"hello": "world"}'
        monospace
        showLineNumbers
        spellCheck={false}
        rows={18}
        aria-label="JSON input"
      />
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>
          {inputLines} {inputLines === 1 ? 'line' : 'lines'} · {inputChars}{' '}
          {inputChars === 1 ? 'character' : 'characters'}
        </span>
      </div>
    </div>
  );

  // ─── Text output ──────────────────────────────────────────────────────────

  const textOutputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Output
        </span>
        <CopyButton value={result.output} disabled={result.output.length === 0} />
      </div>
      {hasError ? (
        <div
          className="flex min-h-[120px] flex-col gap-2 p-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
          }}
          role="alert"
        >
          <div
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Parse error
            {result.errorLine !== null && (
              <span style={{ color: 'var(--text-tertiary)' }}>
                · line {result.errorLine}
                {result.errorColumn !== null && `, column ${result.errorColumn}`}
              </span>
            )}
          </div>
          <p className="mono text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.error}
          </p>
        </div>
      ) : (
        <Textarea
          value={result.output}
          readOnly
          monospace
          showLineNumbers
          placeholder="Formatted JSON will appear here"
          spellCheck={false}
          rows={18}
          aria-label="Formatted JSON output"
        />
      )}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>
          {outputLines} {outputLines === 1 ? 'line' : 'lines'} · {outputChars}{' '}
          {outputChars === 1 ? 'character' : 'characters'}
        </span>
      </div>
    </div>
  );

  // ─── Tree output ──────────────────────────────────────────────────────────

  const treeOutputPanel = (
    // flex-1 so this div fills the InputOutputLayout wrapper (whose height
    // is determined by the textarea on the left via items-stretch).
    <div className="flex flex-1 flex-col gap-2">
      {/* Header — matches the input panel's "Input / Clear" row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Tree View
        </span>
      </div>
      {/* flex-1 + min-h-0: fill remaining space after header/footer and
          allow internal scroll. No hardcoded height — the textarea on the
          left determines the container height via items-stretch, and this
          div grows to match. */}
      <div
        className="flex-1"
        style={{
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <JsonTreeView
          data={result.parsed}
          className="h-full"
        />
      </div>
      {/* Footer — matches the input panel's line/char count */}
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {result.parsed !== undefined
          ? `${topLevelCount(result.parsed)} top-level ${typeof result.parsed === 'object' && result.parsed !== null && !Array.isArray(result.parsed) ? 'keys' : 'items'}`
          : '\u00A0'}
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsBar}
      <InputOutputLayout
        input={inputPanel}
        output={viewMode === 'text' ? textOutputPanel : treeOutputPanel}
        direction="horizontal"
      />
    </ToolPage>
  );
}

export default JsonFormatter;
