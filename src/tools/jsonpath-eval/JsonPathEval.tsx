import { useMemo, useState } from 'react';
import { JSONPath } from 'jsonpath-plus';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';

// ─── Common expressions ───────────────────────────────────────────────────

const COMMON_EXPRESSIONS = [
  { value: '', label: 'Common expressions...' },
  { value: '$..*', label: '$..*  (all values)' },
  { value: '$..name', label: '$..name  (all name fields)' },
  { value: '$.items[0]', label: '$.items[0]  (first item)' },
  { value: '$.items[*]', label: '$.items[*]  (all items)' },
  { value: '$.items[?(@.price > 10)]', label: '$.items[?(@.price > 10)]  (filter)' },
  { value: '$.items.length', label: '$.items.length  (array length)' },
  { value: '$..author', label: '$..author  (all author fields)' },
  { value: '$.store.book[*].title', label: '$.store.book[*].title  (all titles)' },
];

const SAMPLE_JSON = `{
  "store": {
    "book": [
      { "title": "Sayings of the Century", "author": "Nigel Rees", "price": 8.95 },
      { "title": "Sword of Honour", "author": "Evelyn Waugh", "price": 12.99 },
      { "title": "Moby Dick", "author": "Herman Melville", "price": 8.99 },
      { "title": "The Lord of the Rings", "author": "J.R.R. Tolkien", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

// ─── Evaluation ───────────────────────────────────────────────────────────

interface EvalResult {
  output: string;
  matchCount: number;
  jsonError: string | null;
  pathError: string | null;
}

function evaluate(jsonStr: string, pathExpr: string): EvalResult {
  if (!jsonStr.trim()) {
    return { output: '', matchCount: 0, jsonError: null, pathError: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      output: '',
      matchCount: 0,
      jsonError: err instanceof Error ? err.message : String(err),
      pathError: null,
    };
  }

  if (!pathExpr.trim()) {
    return { output: '', matchCount: 0, jsonError: null, pathError: null };
  }

  try {
    const result = JSONPath({ path: pathExpr, json: parsed as object });
    const matchCount = Array.isArray(result) ? result.length : result != null ? 1 : 0;
    const output = JSON.stringify(result, null, 2);
    return { output, matchCount, jsonError: null, pathError: null };
  } catch (err) {
    return {
      output: '',
      matchCount: 0,
      jsonError: null,
      pathError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Component ────────────────────────────────────────────────────────────

function JsonPathEval() {
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [pathExpr, setPathExpr] = useState('$.store.book[*].author');

  const debouncedJson = useDebounce(jsonInput, 200);
  const debouncedPath = useDebounce(pathExpr, 200);

  const result = useMemo(
    () => evaluate(debouncedJson, debouncedPath),
    [debouncedJson, debouncedPath],
  );

  const error = result.jsonError ?? result.pathError;

  // ─── Input panel ─────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          JSON Data
        </span>
      </div>
      <Textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder='Paste JSON here...'
        monospace
        showLineNumbers
        spellCheck={false}
        rows={18}
        aria-label="JSON data input"
        error={result.jsonError ?? undefined}
      />
    </div>
  );

  // ─── Output panel ────────────────────────────────────────────────────

  const outputPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Result
          {result.matchCount > 0 && !error && (
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' '}({result.matchCount} match{result.matchCount === 1 ? '' : 'es'})
            </span>
          )}
        </span>
        <CopyButton value={result.output} disabled={!result.output} />
      </div>

      {result.pathError ? (
        <div
          className="flex min-h-[120px] flex-col gap-2 p-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
          }}
          role="alert"
        >
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--danger)' }}
          >
            JSONPath Error
          </span>
          <p className="mono text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.pathError}
          </p>
        </div>
      ) : (
        <Textarea
          value={result.output}
          readOnly
          monospace
          showLineNumbers
          placeholder="Matched results will appear here"
          spellCheck={false}
          rows={18}
          aria-label="JSONPath evaluation result"
        />
      )}

      {!error && !result.output && debouncedPath.trim() && debouncedJson.trim() && (
        <div
          className="px-4 py-3 text-center text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          No matches found for this expression.
        </div>
      )}
    </div>
  );

  return (
    <ToolPage tool={meta} fullWidth>
      {/* Path expression bar */}
      <div
        className="mb-4 flex flex-wrap items-end gap-3 px-3 py-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div className="flex-1">
          <Input
            label="JSONPath Expression"
            value={pathExpr}
            onChange={(e) => setPathExpr(e.target.value)}
            placeholder="e.g. $.store.book[*].author"
            aria-label="JSONPath expression"
            className="mono"
          />
        </div>
        <div className="w-72">
          <Select
            label="Library"
            value=""
            onChange={(e) => {
              if (e.target.value) setPathExpr(e.target.value);
            }}
            options={COMMON_EXPRESSIONS}
            aria-label="Select a common JSONPath expression"
          />
        </div>
      </div>

      <InputOutputLayout
        input={inputPanel}
        output={outputPanel}
        direction="horizontal"
      />
    </ToolPage>
  );
}

export default JsonPathEval;
