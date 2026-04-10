import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
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
type Level = 'named' | 'all-non-ascii';

interface HtmlEncoderDefaults {
  direction: Direction;
  level: Level;
}

const DEFAULTS: HtmlEncoderDefaults = {
  direction: 'encode',
  level: 'named',
};

const isDirection = (v: unknown): v is Direction => v === 'encode' || v === 'decode';
const isLevel = (v: unknown): v is Level => v === 'named' || v === 'all-non-ascii';

// Defense-in-depth: a manually edited preferences.json could ship anything
// for our defaults blob. Validate each field individually and fall back to
// defaults when shapes don't match.
const sanitizeHtmlEncoderDefaults = (raw: unknown): HtmlEncoderDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    direction: isDirection(obj.direction) ? obj.direction : DEFAULTS.direction,
    level: isLevel(obj.level) ? obj.level : DEFAULTS.level,
  };
};

// ─── Entity tables ──────────────────────────────────────────────────────────

// The basic 5 XSS-relevant characters every encoding pass must handle.
const BASIC_ENCODE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Minimal named-entity decode table — intentionally small, we don't pull a
// library. Covers the basic 5 plus a handful of very common entities.
const NAMED_DECODE: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  laquo: '\u00ab',
  raquo: '\u00bb',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  deg: '\u00b0',
  plusmn: '\u00b1',
  middot: '\u00b7',
  para: '\u00b6',
};

// ─── Encode / decode ────────────────────────────────────────────────────────

const encodeHtml = (input: string, level: Level): string => {
  // Basic encode replaces the 5 XSS-critical characters first.
  const basic = input.replace(/[&<>"']/g, (c) => BASIC_ENCODE[c] ?? c);
  if (level === 'named') return basic;
  // "All non-ASCII" level: every codepoint > 127 becomes a numeric entity.
  // We iterate by codepoint (not code unit) so astral-plane characters like
  // emoji survive as a single reference rather than a broken surrogate pair.
  let out = '';
  for (const ch of basic) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 128) {
      out += ch;
      continue;
    }
    out += `&#${cp};`;
  }
  return out;
};

const decodeHtml = (input: string): string =>
  input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const hex = body.slice(2);
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    if (body.startsWith('#')) {
      const dec = body.slice(1);
      const code = Number.parseInt(dec, 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_DECODE[body];
    return named ?? match;
  });

// ─── Component ──────────────────────────────────────────────────────────────

function HtmlEncoder() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo<HtmlEncoderDefaults>(
    () => sanitizeHtmlEncoderDefaults(stored),
    // Read once on mount — later changes are pushed via the persist effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [level, setLevel] = useState<Level>(initial.level);
  const [input, setInput] = useState<string>('');

  const debouncedInput = useDebounce(input, 150);

  const output = useMemo<string>(() => {
    if (debouncedInput.length === 0) return '';
    if (direction === 'encode') return encodeHtml(debouncedInput, level);
    return decodeHtml(debouncedInput);
  }, [debouncedInput, direction, level]);

  // Persist option changes after the first mount snapshot. We read
  // `toolDefaults` lazily via `getState()` so this component doesn't
  // subscribe to the whole map.
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
        [meta.id]: { direction, level },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, level]);

  const handleSwap = useCallback(() => {
    if (output.length === 0) {
      setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
      return;
    }
    setInput(output);
    setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
  }, [output]);

  const handleClear = useCallback(() => setInput(''), []);

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

      {direction === 'encode' && (
        <div
          className="inline-flex p-1"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
          role="radiogroup"
          aria-label="Encoding level"
        >
          {(
            [
              { id: 'named', label: 'Basic (5 chars)' },
              { id: 'all-non-ascii', label: 'All non-ASCII' },
            ] as const
          ).map((l) => {
            const active = level === l.id;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLevel(l.id)}
                className="px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {output.length > 0 && (
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--success)' }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          OK
        </span>
      )}
    </div>
  );

  // ─── Panels ───────────────────────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="html-encoder-input"
        >
          {direction === 'encode' ? 'Raw text' : 'HTML with entities'}
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
        id="html-encoder-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          direction === 'encode'
            ? 'Type or paste text to escape'
            : 'Paste HTML with &amp;, &lt;, &#38; …'
        }
        monospace
        spellCheck={false}
        rows={12}
        aria-label={direction === 'encode' ? 'Raw text input' : 'HTML input'}
      />
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {direction === 'encode' ? 'Escaped HTML' : 'Decoded text'}
        </span>
        <CopyButton value={output} disabled={output.length === 0} />
      </div>
      <Textarea
        value={output}
        readOnly
        monospace
        placeholder={
          direction === 'encode'
            ? 'Escaped output will appear here'
            : 'Decoded output will appear here'
        }
        spellCheck={false}
        rows={12}
        aria-label={direction === 'encode' ? 'Escaped HTML output' : 'Decoded text output'}
      />
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

export default HtmlEncoder;
