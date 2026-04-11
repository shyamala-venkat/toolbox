import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type Mode = 'escape' | 'unescape';
type Context = 'json' | 'regex' | 'html' | 'url' | 'general';

interface BackslashDefaults {
  mode: Mode;
  context: Context;
}

const DEFAULTS: BackslashDefaults = {
  mode: 'escape',
  context: 'json',
};

// ─── Sanitizers ─────────────────────────────────────────────────────────────

const isMode = (v: unknown): v is Mode => v === 'escape' || v === 'unescape';
const isContext = (v: unknown): v is Context =>
  v === 'json' || v === 'regex' || v === 'html' || v === 'url' || v === 'general';

const sanitizeDefaults = (raw: unknown): BackslashDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    mode: isMode(obj.mode) ? obj.mode : DEFAULTS.mode,
    context: isContext(obj.context) ? obj.context : DEFAULTS.context,
  };
};

// ─── Escape/Unescape implementations ───────────────────────────────────────

const JSON_ESCAPE_MAP: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
};

const JSON_UNESCAPE_MAP: Record<string, string> = {
  '\\"': '"',
  '\\\\': '\\',
  '\\n': '\n',
  '\\r': '\r',
  '\\t': '\t',
  '\\b': '\b',
  '\\f': '\f',
};

function escapeJson(input: string): string {
  return input.replace(/["\\\/\n\r\t\b\f]|[\x00-\x1f]/g, (ch) => {
    const mapped = JSON_ESCAPE_MAP[ch];
    if (mapped !== undefined) return mapped;
    // Control characters
    const code = ch.charCodeAt(0);
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

function unescapeJson(input: string): string {
  return input.replace(
    /\\u([0-9a-fA-F]{4})|\\["\\\/nrtbf]/g,
    (match) => {
      if (match.startsWith('\\u')) {
        return String.fromCharCode(parseInt(match.slice(2), 16));
      }
      return JSON_UNESCAPE_MAP[match] ?? match;
    },
  );
}

const REGEX_CHARS = /[.*+?()[\]{}^$|\\]/g;

function escapeRegex(input: string): string {
  return input.replace(REGEX_CHARS, '\\$&');
}

function unescapeRegex(input: string): string {
  return input.replace(/\\([.*+?()[\]{}^$|\\])/g, '$1');
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_UNESCAPE_MAP: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
};

function escapeHtml(input: string): string {
  return input.replace(/[<>&"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function unescapeHtml(input: string): string {
  return input.replace(/&(?:lt|gt|amp|quot|apos|#39|#x27);/g, (entity) => HTML_UNESCAPE_MAP[entity] ?? entity);
}

function escapeUrl(input: string): string {
  return encodeURIComponent(input);
}

function unescapeUrl(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

const GENERAL_CHARS = /[\\\n\r\t'"]/g;
const GENERAL_ESCAPE_MAP: Record<string, string> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  "'": "\\'",
  '"': '\\"',
};

const GENERAL_UNESCAPE_MAP: Record<string, string> = {
  '\\\\': '\\',
  '\\n': '\n',
  '\\r': '\r',
  '\\t': '\t',
  "\\'": "'",
  '\\"': '"',
};

function escapeGeneral(input: string): string {
  return input.replace(GENERAL_CHARS, (ch) => GENERAL_ESCAPE_MAP[ch] ?? ch);
}

function unescapeGeneral(input: string): string {
  return input.replace(/\\[\\nrt'"]/g, (seq) => GENERAL_UNESCAPE_MAP[seq] ?? seq);
}

// ─── Process dispatch ───────────────────────────────────────────────────────

function process(input: string, mode: Mode, context: Context): string {
  if (input.length === 0) return '';

  const escapeFn = mode === 'escape';

  switch (context) {
    case 'json':
      return escapeFn ? escapeJson(input) : unescapeJson(input);
    case 'regex':
      return escapeFn ? escapeRegex(input) : unescapeRegex(input);
    case 'html':
      return escapeFn ? escapeHtml(input) : unescapeHtml(input);
    case 'url':
      return escapeFn ? escapeUrl(input) : unescapeUrl(input);
    case 'general':
      return escapeFn ? escapeGeneral(input) : unescapeGeneral(input);
  }
}

const CONTEXT_OPTIONS = [
  { value: 'json', label: 'JSON String' },
  { value: 'regex', label: 'Regex' },
  { value: 'html', label: 'HTML' },
  { value: 'url', label: 'URL' },
  { value: 'general', label: 'General' },
];

// ─── Component ──────────────────────────────────────────────────────────────

function BackslashEscape() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const storeUpdate = useSettingsStore((s) => s.update);

  const initial = useMemo<BackslashDefaults>(
    () => sanitizeDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [context, setContext] = useState<Context>(initial.context);

  const debouncedInput = useDebounce(input, 100);

  const output = useMemo(
    () => process(debouncedInput, mode, context),
    [debouncedInput, mode, context],
  );

  // Persist settings with didMount guard
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    storeUpdate({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { mode, context },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, context]);

  const handleSwap = useCallback(() => {
    if (output.length > 0) {
      setInput(output);
    }
    setMode((m) => (m === 'escape' ? 'unescape' : 'escape'));
  }, [output]);

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
        aria-label="Escape mode"
        className="inline-flex p-0.5"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {(
          [
            { id: 'escape', label: 'Escape' },
            { id: 'unescape', label: 'Unescape' },
          ] as const
        ).map((tab) => {
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(tab.id)}
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
          Context
        </span>
        <div className="w-36">
          <Select
            aria-label="Escape context"
            value={context}
            onChange={(e) => setContext(e.target.value as Context)}
            options={CONTEXT_OPTIONS}
          />
        </div>
      </div>
    </div>
  );

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          htmlFor="bse-input"
        >
          {mode === 'escape' ? 'Plain text' : 'Escaped text'}
        </label>
      </div>
      <Textarea
        id="bse-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={mode === 'escape' ? 'Type text to escape' : 'Paste escaped text to unescape'}
        monospace
        spellCheck={false}
        rows={14}
        aria-label={mode === 'escape' ? 'Plain text input' : 'Escaped text input'}
      />
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'escape' ? 'Escaped output' : 'Unescaped output'}
        </span>
        <CopyButton value={output} disabled={output.length === 0} />
      </div>
      <Textarea
        value={output}
        readOnly
        monospace
        placeholder="Output will appear here"
        spellCheck={false}
        rows={14}
        aria-label={mode === 'escape' ? 'Escaped output' : 'Unescaped output'}
      />
    </div>
  );

  return (
    <ToolPage tool={meta}>
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

export default BackslashEscape;
