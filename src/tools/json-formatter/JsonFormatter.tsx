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
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type IndentChoice = '2' | '4' | 'tab';

interface JsonFormatterDefaults {
  indent: IndentChoice;
  sortKeys: boolean;
  minify: boolean;
}

const DEFAULTS: JsonFormatterDefaults = {
  indent: '2',
  sortKeys: false,
  minify: false,
};

interface FormatResult {
  output: string;
  error: string | null;
  errorLine: number | null;
  errorColumn: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const stripBom = (s: string): string =>
  s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;

/**
 * Recursively sort object keys (arrays preserve order). Used when the
 * "sort keys" option is on.
 */
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

/**
 * Convert a character offset (from `JSON.parse` error messages) to a
 * line/column pair against the original text. Both 1-indexed.
 */
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

/**
 * Parse a JSON.parse error message for a position offset. The native error
 * shape varies between engines: V8 uses "at position N", SpiderMonkey uses
 * "at line L column C". We try both.
 */
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
    return { output: '', error: null, errorLine: null, errorColumn: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const loc = extractErrorLocation(message, source);
    return {
      output: '',
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
      error: null,
      errorLine: null,
      errorColumn: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: '', error: message, errorLine: null, errorColumn: null };
  }
};

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

// ─── Component ──────────────────────────────────────────────────────────────

// Defense-in-depth: a malformed `preferences.json` (manually edited or from
// a future schema) shouldn't crash the tool. Validate every persisted field
// against its expected runtime shape and fall back to a hard-coded default
// when the value isn't usable. The user won't notice the recovery.
const isIndentChoice = (value: unknown): value is IndentChoice =>
  value === '2' || value === '4' || value === 'tab';

const sanitizeJsonFormatterDefaults = (raw: unknown): JsonFormatterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    indent: isIndentChoice(obj.indent) ? obj.indent : DEFAULTS.indent,
    sortKeys: typeof obj.sortKeys === 'boolean' ? obj.sortKeys : DEFAULTS.sortKeys,
    minify: typeof obj.minify === 'boolean' ? obj.minify : DEFAULTS.minify,
  };
};

function JsonFormatter() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here. Zustand
  // compares the returned reference, and `settingsStore.update()` creates a
  // fresh nested object only for the tool that actually changed.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial: JsonFormatterDefaults = useMemo(
    () => sanitizeJsonFormatterDefaults(stored),
    // We only want to read stored defaults once on mount; subsequent changes
    // are pushed via persistDefault below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState<string>('');
  const [indent, setIndent] = useState<IndentChoice>(initial.indent);
  const [sortKeys, setSortKeys] = useState<boolean>(initial.sortKeys);
  const [minify, setMinify] = useState<boolean>(initial.minify);

  const debouncedInput = useDebounce(input, 150);

  const result = useMemo(
    () => formatJson(debouncedInput, indent, sortKeys, minify),
    [debouncedInput, indent, sortKeys, minify],
  );

  // Persist option changes (after the initial mount snapshot has been read).
  // We read the full `toolDefaults` map lazily via `getState()` so this
  // component doesn't subscribe to it — otherwise every unrelated tool's
  // persist would trigger a re-render here.
  const persistDefaults = useCallback(
    (next: Partial<JsonFormatterDefaults>) => {
      const merged: JsonFormatterDefaults = {
        indent,
        sortKeys,
        minify,
        ...next,
      };
      const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
      update({
        toolDefaults: {
          ...allDefaults,
          [meta.id]: merged,
        },
      });
    },
    [indent, sortKeys, minify, update],
  );

  // Re-persist whenever any option changes (skips first mount via the
  // initial-state guard).
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    persistDefaults({});
    // persistDefaults intentionally not in deps — it's a fresh closure each
    // render, and the option values it depends on are listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indent, sortKeys, minify]);

  const handleClear = useCallback(() => setInput(''), []);

  const inputLines = countLines(input);
  const outputLines = countLines(result.output);
  const inputChars = input.length;
  const outputChars = result.output.length;

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
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

      <Toggle
        checked={sortKeys}
        onChange={setSortKeys}
        label="Sort keys"
      />

      <Toggle
        checked={minify}
        onChange={setMinify}
        label="Minify"
      />

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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={input.length === 0}
        >
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
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>
          {inputLines} {inputLines === 1 ? 'line' : 'lines'} · {inputChars}{' '}
          {inputChars === 1 ? 'character' : 'characters'}
        </span>
      </div>
    </div>
  );

  const outputPanel = (
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
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>
          {outputLines} {outputLines === 1 ? 'line' : 'lines'} · {outputChars}{' '}
          {outputChars === 1 ? 'character' : 'characters'}
        </span>
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsBar}
      <InputOutputLayout input={inputPanel} output={outputPanel} direction="horizontal" />
    </ToolPage>
  );
}

export default JsonFormatter;
