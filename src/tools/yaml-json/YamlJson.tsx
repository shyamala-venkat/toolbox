import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  load,
  loadAll,
  dump,
  JSON_SCHEMA,
  YAMLException,
} from 'js-yaml';
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

type Direction = 'yaml-to-json' | 'json-to-yaml';
type Indent = '2' | '4';

interface YamlJsonDefaults {
  direction: Direction;
  indent: Indent;
  multiDoc: boolean;
}

const DEFAULTS: YamlJsonDefaults = {
  direction: 'yaml-to-json',
  indent: '2',
  multiDoc: false,
};

interface ConvertResult {
  output: string;
  error: string | null;
  errorLine: number | null;
  errorColumn: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const isDirection = (value: unknown): value is Direction =>
  value === 'yaml-to-json' || value === 'json-to-yaml';

const isIndent = (value: unknown): value is Indent =>
  value === '2' || value === '4';

// Defense-in-depth: validate persisted defaults against expected shapes and
// fall back to hard-coded values on any mismatch.
const sanitizeYamlJsonDefaults = (raw: unknown): YamlJsonDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    direction: isDirection(obj.direction) ? obj.direction : DEFAULTS.direction,
    indent: isIndent(obj.indent) ? obj.indent : DEFAULTS.indent,
    multiDoc: typeof obj.multiDoc === 'boolean' ? obj.multiDoc : DEFAULTS.multiDoc,
  };
};

const stripBom = (s: string): string =>
  s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;

const EMPTY: ConvertResult = { output: '', error: null, errorLine: null, errorColumn: null };

/**
 * Convert YAML → JSON using the safe JSON_SCHEMA. This explicitly avoids the
 * default schema, which supports YAML's `<<` merge syntax and a handful of
 * other constructs that have been used for prototype-pollution attacks in the
 * past.
 */
function yamlToJson(raw: string, indent: Indent, multiDoc: boolean): ConvertResult {
  const source = stripBom(raw);
  if (source.trim().length === 0) return EMPTY;

  try {
    const parsed = multiDoc
      ? loadAll(source, null, { schema: JSON_SCHEMA })
      : load(source, { schema: JSON_SCHEMA });
    const spaces = Number.parseInt(indent, 10);
    const output = JSON.stringify(parsed, null, spaces);
    return {
      output: output ?? '',
      error: null,
      errorLine: null,
      errorColumn: null,
    };
  } catch (err) {
    if (err instanceof YAMLException) {
      const line = err.mark ? err.mark.line + 1 : null;
      const column = err.mark ? err.mark.column + 1 : null;
      return {
        output: '',
        error: err.reason ?? err.message,
        errorLine: line,
        errorColumn: column,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { output: '', error: message, errorLine: null, errorColumn: null };
  }
}

/**
 * Convert JSON → YAML using the safe JSON_SCHEMA on the dump side as well,
 * so merge keys and other non-JSON types never land in the output.
 */
function jsonToYaml(raw: string, indent: Indent): ConvertResult {
  const source = stripBom(raw);
  if (source.trim().length === 0) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { output: '', error: message, errorLine: null, errorColumn: null };
  }

  try {
    const spaces = Number.parseInt(indent, 10);
    const output = dump(parsed, {
      indent: spaces,
      lineWidth: 80,
      schema: JSON_SCHEMA,
      noRefs: true,
    });
    return { output, error: null, errorLine: null, errorColumn: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown serialize error';
    return { output: '', error: message, errorLine: null, errorColumn: null };
  }
}

/**
 * Sniff whether the input "looks like" JSON: it trims to a `{` or `[`
 * opener and parses cleanly. Used for auto-direction on paste.
 */
function looksLikeJson(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

// ─── Component ──────────────────────────────────────────────────────────────

function YamlJson() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<YamlJsonDefaults>(
    () => sanitizeYamlJsonDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState<string>('');
  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [indent, setIndent] = useState<Indent>(initial.indent);
  const [multiDoc, setMultiDoc] = useState<boolean>(initial.multiDoc);
  // Once the user flips the direction manually we stop auto-sniffing, so the
  // toggle stays where they put it.
  const [directionLocked, setDirectionLocked] = useState<boolean>(false);

  const debouncedInput = useDebounce(input, 200);

  // Auto-detect direction from the input, but only when the user hasn't
  // manually selected one.
  useEffect(() => {
    if (directionLocked) return;
    if (debouncedInput.trim().length === 0) return;
    const next: Direction = looksLikeJson(debouncedInput) ? 'json-to-yaml' : 'yaml-to-json';
    setDirection((prev) => (prev === next ? prev : next));
  }, [debouncedInput, directionLocked]);

  const result = useMemo(
    () =>
      direction === 'yaml-to-json'
        ? yamlToJson(debouncedInput, indent, multiDoc)
        : jsonToYaml(debouncedInput, indent),
    [debouncedInput, direction, indent, multiDoc],
  );

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
        [meta.id]: { direction, indent, multiDoc },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, indent, multiDoc]);

  const handleClear = useCallback(() => setInput(''), []);

  const handleSwap = useCallback(() => {
    // Swap by moving the current output into the input and flipping the
    // direction. This matches the mental model established by other two-way
    // converters in the app (base64).
    if (result.output.length === 0) {
      setDirection((d) => (d === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json'));
      setDirectionLocked(true);
      return;
    }
    setInput(result.output);
    setDirection((d) => (d === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json'));
    setDirectionLocked(true);
  }, [result.output]);

  const handleDirectionChange = useCallback((next: Direction) => {
    setDirection(next);
    setDirectionLocked(true);
  }, []);

  // Any deliberate user adjustment of the conversion options should also
  // freeze the auto-direction sniffer — otherwise tweaking indent or the
  // multi-doc toggle leaves the sniffer free to flip the direction back
  // under the user on the next debounced input change.
  const handleIndentChange = useCallback((next: Indent) => {
    setIndent(next);
    setDirectionLocked(true);
  }, []);

  const handleMultiDocChange = useCallback((next: boolean) => {
    setMultiDoc(next);
    setDirectionLocked(true);
  }, []);

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

  const inputLines = countLines(input);
  const outputLines = countLines(result.output);

  const inputLabel = direction === 'yaml-to-json' ? 'YAML' : 'JSON';
  const outputLabel = direction === 'yaml-to-json' ? 'JSON' : 'YAML';

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
      <div
        role="tablist"
        aria-label="Conversion direction"
        className="inline-flex p-0.5"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {(
          [
            { id: 'yaml-to-json', label: 'YAML → JSON' },
            { id: 'json-to-yaml', label: 'JSON → YAML' },
          ] as const
        ).map((tab) => {
          const isActive = direction === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleDirectionChange(tab.id)}
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

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Indent
        </span>
        <div className="w-24">
          <Select
            aria-label="Indentation"
            value={indent}
            onChange={(e) => handleIndentChange(e.target.value as Indent)}
            options={[
              { value: '2', label: '2 spaces' },
              { value: '4', label: '4 spaces' },
            ]}
          />
        </div>
      </div>

      {direction === 'yaml-to-json' && (
        <Toggle
          checked={multiDoc}
          onChange={handleMultiDocChange}
          label="Multi-doc → array"
        />
      )}

      <div className="ml-auto flex items-center gap-2">
        {isValid && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--success)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Converted
          </span>
        )}
        {hasError && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Invalid {inputLabel}
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
          htmlFor="yaml-json-input"
        >
          {inputLabel} input
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
        id="yaml-json-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          direction === 'yaml-to-json'
            ? 'Paste YAML here, e.g. foo: bar'
            : 'Paste JSON here, e.g. {"foo": "bar"}'
        }
        monospace
        spellCheck={false}
        rows={18}
        aria-label={`${inputLabel} input`}
      />
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {inputLines} {inputLines === 1 ? 'line' : 'lines'}
      </div>
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {outputLabel} output
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
          placeholder={`${outputLabel} output will appear here`}
          spellCheck={false}
          rows={18}
          aria-label={`${outputLabel} output`}
        />
      )}
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {outputLines} {outputLines === 1 ? 'line' : 'lines'}
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {optionsBar}
      <InputOutputLayout
        input={inputPanel}
        output={outputPanel}
        direction="horizontal"
        onSwap={handleSwap}
      />
    </ToolPage>
  );
}

export default YamlJson;
