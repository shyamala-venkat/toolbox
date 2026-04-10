import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

type Direction = 'encode' | 'decode';
type Scope = 'component' | 'url';

interface UrlEncoderDefaults {
  direction: Direction;
  scope: Scope;
}

const DEFAULTS: UrlEncoderDefaults = {
  direction: 'encode',
  scope: 'component',
};

interface ProcessResult {
  output: string;
  error: string | null;
}

// ─── Persisted-default sanitizer ────────────────────────────────────────────
//
// Defense-in-depth: a manually edited preferences.json could ship anything
// for our defaults blob. Validate each field individually and fall back to
// the hard-coded default when the shape doesn't match.

const isDirection = (v: unknown): v is Direction => v === 'encode' || v === 'decode';
const isScope = (v: unknown): v is Scope => v === 'component' || v === 'url';

const sanitizeUrlEncoderDefaults = (raw: unknown): UrlEncoderDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    direction: isDirection(obj.direction) ? obj.direction : DEFAULTS.direction,
    scope: isScope(obj.scope) ? obj.scope : DEFAULTS.scope,
  };
};

// ─── Processing ─────────────────────────────────────────────────────────────

const process = (input: string, direction: Direction, scope: Scope): ProcessResult => {
  if (input.length === 0) return { output: '', error: null };
  try {
    if (direction === 'encode') {
      const output = scope === 'component' ? encodeURIComponent(input) : encodeURI(input);
      return { output, error: null };
    }
    const output = scope === 'component' ? decodeURIComponent(input) : decodeURI(input);
    return { output, error: null };
  } catch (err) {
    // URIError can throw on malformed %xx sequences during decode, or on
    // unpaired surrogates during encode.
    const message =
      err instanceof URIError
        ? direction === 'decode'
          ? 'Input contains a malformed percent-encoded sequence.'
          : 'Input contains an unpaired surrogate and cannot be encoded.'
        : err instanceof Error
          ? err.message
          : 'Unknown error';
    return { output: '', error: message };
  }
};

// ─── Component ──────────────────────────────────────────────────────────────

function UrlEncoder() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<UrlEncoderDefaults>(
    () => sanitizeUrlEncoderDefaults(stored),
    // Read once on mount — later changes are pushed via the persist effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [input, setInput] = useState<string>('');

  const debouncedInput = useDebounce(input, 150);

  const result = useMemo<ProcessResult>(
    () => process(debouncedInput, direction, scope),
    [debouncedInput, direction, scope],
  );

  // Persist option changes after the first mount snapshot. We read
  // `toolDefaults` from the live store via `getState()` so this component
  // doesn't subscribe to the whole map.
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
        [meta.id]: { direction, scope },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, scope]);

  const handleSwap = useCallback(() => {
    if (result.error || result.output.length === 0) {
      setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
      return;
    }
    setInput(result.output);
    setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
  }, [result]);

  const handleClear = useCallback(() => setInput(''), []);

  // ─── Options bar ──────────────────────────────────────────────────────────

  const isEmpty = input.length === 0;
  const hasError = !isEmpty && result.error !== null;
  const isValid = !isEmpty && result.error === null && result.output.length > 0;

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
        className="inline-flex p-1"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
        role="radiogroup"
        aria-label="Direction"
      >
        {(['encode', 'decode'] as const).map((d) => {
          const active = direction === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDirection(d)}
              className="px-3 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div
        className="inline-flex p-1"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
        role="radiogroup"
        aria-label="Scope"
      >
        {(
          [
            { id: 'component', label: 'Component' },
            { id: 'url', label: 'Full URL' },
          ] as const
        ).map((s) => {
          const active = scope === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setScope(s.id)}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {scope === 'component'
          ? 'encodeURIComponent / decodeURIComponent'
          : 'encodeURI / decodeURI'}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {isValid && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--success)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            OK
          </span>
        )}
        {hasError && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--danger)' }}
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {direction === 'encode' ? 'Encoding error' : 'Decoding error'}
          </span>
        )}
      </div>
    </div>
  );

  // ─── Panels ───────────────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="url-encoder-input"
        >
          {direction === 'encode' ? 'Plain input' : 'Percent-encoded input'}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty}
        >
          Clear
        </Button>
      </div>
      <Textarea
        id="url-encoder-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          direction === 'encode'
            ? scope === 'component'
              ? 'e.g. hello world & friends'
              : 'e.g. https://example.com/path with spaces'
            : 'Paste a percent-encoded URL'
        }
        monospace
        spellCheck={false}
        rows={12}
        aria-label={direction === 'encode' ? 'Plain input' : 'Encoded input'}
      />
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {direction === 'encode' ? 'Percent-encoded output' : 'Decoded output'}
        </span>
        <CopyButton value={result.output} disabled={result.output.length === 0} />
      </div>
      {result.error ? (
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
            {direction === 'encode' ? 'Encoding error' : 'Decoding error'}
          </div>
          <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
            {result.error}
          </p>
        </div>
      ) : (
        <Textarea
          value={result.output}
          readOnly
          monospace
          placeholder={
            direction === 'encode'
              ? 'Percent-encoded output will appear here'
              : 'Decoded output will appear here'
          }
          spellCheck={false}
          rows={12}
          aria-label={direction === 'encode' ? 'Encoded output' : 'Decoded output'}
        />
      )}
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

export default UrlEncoder;
