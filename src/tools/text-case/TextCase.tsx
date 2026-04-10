import { useCallback, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';
import {
  tokenize,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toScreamingSnakeCase,
  toKebabCase,
  toScreamingKebabCase,
  toDotCase,
  toTitleCase,
  toSentenceCase,
  toUpperCase,
  toLowerCase,
  toAlternatingCase,
  toInverseCase,
} from './cases';

// ─── Config ─────────────────────────────────────────────────────────────────

interface CaseRow {
  id: string;
  label: string;
  compute: (input: string, tokens: string[]) => string;
}

// Formatters that depend on tokens get the token list; those that mutate the
// original string character-by-character (alternating, inverse) get the raw
// input so spacing and punctuation survive.
const CASES: CaseRow[] = [
  { id: 'camel', label: 'camelCase', compute: (_, t) => toCamelCase(t) },
  { id: 'pascal', label: 'PascalCase', compute: (_, t) => toPascalCase(t) },
  { id: 'snake', label: 'snake_case', compute: (_, t) => toSnakeCase(t) },
  {
    id: 'screaming-snake',
    label: 'SCREAMING_SNAKE_CASE',
    compute: (_, t) => toScreamingSnakeCase(t),
  },
  { id: 'kebab', label: 'kebab-case', compute: (_, t) => toKebabCase(t) },
  {
    id: 'screaming-kebab',
    label: 'SCREAMING-KEBAB-CASE',
    compute: (_, t) => toScreamingKebabCase(t),
  },
  { id: 'dot', label: 'dot.case', compute: (_, t) => toDotCase(t) },
  { id: 'title', label: 'Title Case', compute: (_, t) => toTitleCase(t) },
  { id: 'sentence', label: 'Sentence case', compute: (_, t) => toSentenceCase(t) },
  { id: 'upper', label: 'UPPER CASE', compute: (_, t) => toUpperCase(t) },
  { id: 'lower', label: 'lower case', compute: (_, t) => toLowerCase(t) },
  {
    id: 'alternating',
    label: 'aLtErNaTiNg cAsE',
    compute: (input) => toAlternatingCase(input),
  },
  { id: 'inverse', label: 'InVeRsE cAsE', compute: (input) => toInverseCase(input) },
];

// ─── Component ──────────────────────────────────────────────────────────────

function TextCase() {
  const [input, setInput] = useState<string>('');
  const debouncedInput = useDebounce(input, 100);

  const rows = useMemo(() => {
    const tokens = tokenize(debouncedInput);
    return CASES.map((c) => ({ ...c, value: c.compute(debouncedInput, tokens) }));
  }, [debouncedInput]);

  const handleClear = useCallback(() => setInput(''), []);

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="text-case-input"
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
        id="text-case-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type or paste text, e.g. helloWorld or my new variable"
        spellCheck={false}
        rows={5}
        aria-label="Text to convert"
      />
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        Conversions
      </span>
      <div
        className="flex flex-col"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="flex items-center gap-3 px-3 py-2.5"
            style={{
              borderTop:
                index === 0 ? 'none' : '1px solid var(--border-secondary)',
            }}
          >
            <div className="w-44 shrink-0">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {row.label}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="mono truncate text-sm"
                style={{
                  color: row.value.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                }}
                title={row.value}
              >
                {row.value.length === 0 ? '—' : row.value}
              </div>
            </div>
            <CopyButton value={row.value} disabled={row.value.length === 0} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {inputPanel}
        {outputPanel}
      </div>
    </ToolPage>
  );
}

export default TextCase;
