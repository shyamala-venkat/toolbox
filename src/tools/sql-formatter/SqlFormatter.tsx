import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { format as formatSql } from 'sql-formatter';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta, SQL_DIALECTS, SQL_DIALECT_IDS, type SqlDialect } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type TabWidth = '2' | '4' | 'tab';
type KeywordCase = 'upper' | 'lower' | 'preserve';

interface SqlFormatterDefaults {
  dialect: SqlDialect;
  tabWidth: TabWidth;
  keywordCase: KeywordCase;
}

const DEFAULTS: SqlFormatterDefaults = {
  dialect: 'sql',
  tabWidth: '2',
  keywordCase: 'upper',
};

interface FormatResult {
  output: string;
  error: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const isDialect = (value: unknown): value is SqlDialect =>
  typeof value === 'string' && (SQL_DIALECT_IDS as readonly string[]).includes(value);

const isTabWidth = (value: unknown): value is TabWidth =>
  value === '2' || value === '4' || value === 'tab';

const isKeywordCase = (value: unknown): value is KeywordCase =>
  value === 'upper' || value === 'lower' || value === 'preserve';

// Defense-in-depth: a manually edited preferences.json could ship anything
// for our defaults blob. Validate every persisted field against its expected
// runtime shape and fall back to hard-coded defaults on mismatch.
const sanitizeSqlFormatterDefaults = (raw: unknown): SqlFormatterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    dialect: isDialect(obj.dialect) ? obj.dialect : DEFAULTS.dialect,
    tabWidth: isTabWidth(obj.tabWidth) ? obj.tabWidth : DEFAULTS.tabWidth,
    keywordCase: isKeywordCase(obj.keywordCase) ? obj.keywordCase : DEFAULTS.keywordCase,
  };
};

const runFormat = (
  raw: string,
  dialect: SqlDialect,
  tabWidth: TabWidth,
  keywordCase: KeywordCase,
): FormatResult => {
  if (raw.trim().length === 0) {
    return { output: '', error: null };
  }
  try {
    const useTab = tabWidth === 'tab';
    const output = formatSql(raw, {
      language: dialect,
      tabWidth: useTab ? 1 : Number.parseInt(tabWidth, 10),
      useTabs: useTab,
      keywordCase,
    });
    return { output, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    // sql-formatter errors can be multi-line and noisy — trim to a single
    // sentence so the inline error panel stays readable.
    const firstLine = message.split('\n')[0] ?? message;
    return { output: '', error: firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine };
  }
};

const countLines = (s: string): number => (s.length === 0 ? 0 : s.split('\n').length);

// ─── Component ──────────────────────────────────────────────────────────────

function SqlFormatter() {
  // Subscribe only to this tool's slice to avoid re-renders when unrelated
  // tools persist their own defaults.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<SqlFormatterDefaults>(
    () => sanitizeSqlFormatterDefaults(stored),
    // Read once on mount — later changes are pushed via the persist effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState<string>('');
  const [dialect, setDialect] = useState<SqlDialect>(initial.dialect);
  const [tabWidth, setTabWidth] = useState<TabWidth>(initial.tabWidth);
  const [keywordCase, setKeywordCase] = useState<KeywordCase>(initial.keywordCase);

  const debouncedInput = useDebounce(input, 200);

  const result = useMemo(
    () => runFormat(debouncedInput, dialect, tabWidth, keywordCase),
    [debouncedInput, dialect, tabWidth, keywordCase],
  );

  // Persist options after the initial mount snapshot so we don't overwrite
  // stored values on first render. We read `toolDefaults` lazily via
  // `getState()` so this component doesn't subscribe to the whole map.
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
        [meta.id]: { dialect, tabWidth, keywordCase },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialect, tabWidth, keywordCase]);

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
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Dialect
        </span>
        <div className="w-40">
          <Select
            aria-label="SQL dialect"
            value={dialect}
            onChange={(e) => setDialect(e.target.value as SqlDialect)}
            options={SQL_DIALECTS.map((d) => ({ value: d.value, label: d.label }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Tab width
        </span>
        <div className="w-24">
          <Select
            aria-label="Tab width"
            value={tabWidth}
            onChange={(e) => setTabWidth(e.target.value as TabWidth)}
            options={[
              { value: '2', label: '2 spaces' },
              { value: '4', label: '4 spaces' },
              { value: 'tab', label: 'Tab' },
            ]}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Keywords
        </span>
        <div className="w-32">
          <Select
            aria-label="Keyword case"
            value={keywordCase}
            onChange={(e) => setKeywordCase(e.target.value as KeywordCase)}
            options={[
              { value: 'upper', label: 'UPPER' },
              { value: 'lower', label: 'lower' },
              { value: 'preserve', label: 'Preserve' },
            ]}
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
            Formatted
          </span>
        )}
        {hasError && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Parse error
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
          htmlFor="sql-formatter-input"
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
        id="sql-formatter-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste SQL here, e.g. select * from users where id=1"
        monospace
        showLineNumbers
        spellCheck={false}
        rows={18}
        aria-label="SQL input"
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
            Could not format SQL
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
          placeholder="Formatted SQL will appear here"
          spellCheck={false}
          rows={18}
          aria-label="Formatted SQL output"
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

export default SqlFormatter;
