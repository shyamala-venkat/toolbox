import { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type Direction = 'csv-to-json' | 'json-to-csv';

interface CsvJsonDefaults {
  direction: Direction;
  header: boolean;
  prettyPrint: boolean;
}

const DEFAULTS: CsvJsonDefaults = {
  direction: 'csv-to-json',
  header: true,
  prettyPrint: true,
};

interface ConvertResult {
  output: string;
  error: string | null;
}

// ─── Sanitizers ─────────────────────────────────────────────────────────────

const isDirection = (v: unknown): v is Direction =>
  v === 'csv-to-json' || v === 'json-to-csv';

const sanitizeDefaults = (raw: unknown): CsvJsonDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    direction: isDirection(obj.direction) ? obj.direction : DEFAULTS.direction,
    header: typeof obj.header === 'boolean' ? obj.header : DEFAULTS.header,
    prettyPrint: typeof obj.prettyPrint === 'boolean' ? obj.prettyPrint : DEFAULTS.prettyPrint,
  };
};

// ─── Converters ─────────────────────────────────────────────────────────────

const EMPTY: ConvertResult = { output: '', error: null };

function csvToJson(csv: string, header: boolean, prettyPrint: boolean): ConvertResult {
  if (csv.trim().length === 0) return EMPTY;

  const result = Papa.parse(csv, {
    header,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0]!;
    return {
      output: '',
      error: `Row ${firstError.row ?? '?'}: ${firstError.message ?? 'Unknown error'}`,
    };
  }

  const json = prettyPrint
    ? JSON.stringify(result.data, null, 2)
    : JSON.stringify(result.data);

  return { output: json, error: null };
}

function jsonToCsv(json: string): ConvertResult {
  if (json.trim().length === 0) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { output: '', error: message };
  }

  if (!Array.isArray(parsed)) {
    return { output: '', error: 'JSON input must be an array of objects' };
  }

  if (parsed.length === 0) {
    return { output: '', error: null };
  }

  if (typeof parsed[0] !== 'object' || parsed[0] === null || Array.isArray(parsed[0])) {
    return { output: '', error: 'Each array element must be an object' };
  }

  try {
    const csv = Papa.unparse(parsed as Record<string, unknown>[]);
    return { output: csv, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Conversion failed';
    return { output: '', error: message };
  }
}

/**
 * Sniff whether the input looks like JSON (starts with `[`).
 */
function looksLikeJson(source: string): boolean {
  const trimmed = source.trim();
  return trimmed.length > 0 && trimmed[0] === '[';
}

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

// ─── Component ──────────────────────────────────────────────────────────────

function CsvJson() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<CsvJsonDefaults>(
    () => sanitizeDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [header, setHeader] = useState(initial.header);
  const [prettyPrint, setPrettyPrint] = useState(initial.prettyPrint);
  const [directionLocked, setDirectionLocked] = useState(false);

  const debouncedInput = useDebounce(input, 200);

  // Auto-detect direction from input
  useEffect(() => {
    if (directionLocked) return;
    if (debouncedInput.trim().length === 0) return;
    const next: Direction = looksLikeJson(debouncedInput) ? 'json-to-csv' : 'csv-to-json';
    setDirection((prev) => (prev === next ? prev : next));
  }, [debouncedInput, directionLocked]);

  const result = useMemo(
    () =>
      direction === 'csv-to-json'
        ? csvToJson(debouncedInput, header, prettyPrint)
        : jsonToCsv(debouncedInput),
    [debouncedInput, direction, header, prettyPrint],
  );

  // Persist settings with didMount guard
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
        [meta.id]: { direction, header, prettyPrint },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, header, prettyPrint]);

  const handleClear = useCallback(() => setInput(''), []);

  const handleSwap = useCallback(() => {
    if (result.output.length === 0) {
      setDirection((d) => (d === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
      setDirectionLocked(true);
      return;
    }
    setInput(result.output);
    setDirection((d) => (d === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
    setDirectionLocked(true);
  }, [result.output]);

  const handleDirectionChange = useCallback((next: Direction) => {
    setDirection(next);
    setDirectionLocked(true);
  }, []);

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

  const inputLabel = direction === 'csv-to-json' ? 'CSV' : 'JSON';
  const outputLabel = direction === 'csv-to-json' ? 'JSON' : 'CSV';

  const inputLines = countLines(input);
  const outputLines = countLines(result.output);

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
            { id: 'csv-to-json', label: 'CSV → JSON' },
            { id: 'json-to-csv', label: 'JSON → CSV' },
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

      {direction === 'csv-to-json' && (
        <Toggle
          checked={header}
          onChange={(next) => {
            setHeader(next);
            setDirectionLocked(true);
          }}
          label="First row is header"
        />
      )}

      {direction === 'csv-to-json' && (
        <Toggle
          checked={prettyPrint}
          onChange={(next) => {
            setPrettyPrint(next);
            setDirectionLocked(true);
          }}
          label="Pretty-print"
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
          htmlFor="csv-json-input"
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
        id="csv-json-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          direction === 'csv-to-json'
            ? 'Paste CSV here, e.g. name,age\nJohn,30'
            : 'Paste JSON array here, e.g. [{"name":"John","age":30}]'
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

export default CsvJson;
