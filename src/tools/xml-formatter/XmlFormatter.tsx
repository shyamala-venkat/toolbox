import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import { formatXml, minifyXml, type XmlIndent } from './format';

// ─── Types ──────────────────────────────────────────────────────────────────

type XmlMode = 'format' | 'minify';

interface XmlFormatterDefaults {
  mode: XmlMode;
  indent: XmlIndent;
}

const DEFAULTS: XmlFormatterDefaults = {
  mode: 'format',
  indent: '2',
};

const isMode = (value: unknown): value is XmlMode =>
  value === 'format' || value === 'minify';

const isIndent = (value: unknown): value is XmlIndent =>
  value === '2' || value === '4' || value === 'tab';

// Defense-in-depth: validate persisted defaults against expected shapes and
// fall back to hard-coded values on any mismatch.
const sanitizeXmlFormatterDefaults = (raw: unknown): XmlFormatterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    mode: isMode(obj.mode) ? obj.mode : DEFAULTS.mode,
    indent: isIndent(obj.indent) ? obj.indent : DEFAULTS.indent,
  };
};

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

// ─── Component ──────────────────────────────────────────────────────────────

function XmlFormatter() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<XmlFormatterDefaults>(
    () => sanitizeXmlFormatterDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState<string>('');
  const [mode, setMode] = useState<XmlMode>(initial.mode);
  const [indent, setIndent] = useState<XmlIndent>(initial.indent);

  const debouncedInput = useDebounce(input, 200);

  const result = useMemo(
    () => (mode === 'format' ? formatXml(debouncedInput, indent) : minifyXml(debouncedInput)),
    [debouncedInput, mode, indent],
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
        [meta.id]: { mode, indent },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, indent]);

  const handleClear = useCallback(() => setInput(''), []);

  const isEmpty = input.trim().length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

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
        aria-label="Output mode"
        className="inline-flex p-0.5"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {(['format', 'minify'] as const).map((m) => {
          const isActive = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(m)}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium transition-colors duration-150"
              style={{
                backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {m === 'format' ? 'Format' : 'Minify'}
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
            onChange={(e) => setIndent(e.target.value as XmlIndent)}
            options={[
              { value: '2', label: '2 spaces' },
              { value: '4', label: '4 spaces' },
              { value: 'tab', label: 'Tab' },
            ]}
            disabled={mode === 'minify'}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isValid && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--success)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Valid XML
          </span>
        )}
        {hasError && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Invalid XML
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
          htmlFor="xml-formatter-input"
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
        id="xml-formatter-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='Paste XML here, e.g. <root><item id="1">value</item></root>'
        monospace
        showLineNumbers
        spellCheck={false}
        rows={18}
        aria-label="XML input"
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
              <span style={{ color: 'var(--text-tertiary)' }}>· line {result.errorLine}</span>
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
          placeholder="Formatted XML will appear here"
          spellCheck={false}
          rows={18}
          aria-label="Formatted XML output"
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
      <InputOutputLayout input={inputPanel} output={outputPanel} direction="horizontal" />
    </ToolPage>
  );
}

export default XmlFormatter;
