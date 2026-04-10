import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { InputOutputLayout } from '@/components/tool/InputOutputLayout';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import { cleanupText, sanitizeCleanupOptions, type CleanupOptions } from './cleanup';

// ─── Component ──────────────────────────────────────────────────────────────

function TextCleanup() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initial = useMemo(() => sanitizeCleanupOptions(stored), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [input, setInput] = useState('');
  const [options, setOptions] = useState<CleanupOptions>(initial);

  const debouncedInput = useDebounce(input, 100);

  const result = useMemo(
    () => cleanupText(debouncedInput, options),
    [debouncedInput, options],
  );

  // Persist option changes after mount
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    update({ toolDefaults: { ...allDefaults, [meta.id]: options } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const setOption = useCallback(<K extends keyof CleanupOptions>(key: K, value: CleanupOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleClear = useCallback(() => setInput(''), []);

  // ─── Stats line ────────────────────────────────────────────────────────

  const statsLine = useMemo(() => {
    const parts: string[] = [];
    if (result.stats.linesRemoved > 0) {
      parts.push(`${result.stats.linesRemoved} line${result.stats.linesRemoved === 1 ? '' : 's'} removed`);
    }
    if (result.stats.charactersTrimmed > 0) {
      parts.push(`${result.stats.charactersTrimmed} char${result.stats.charactersTrimmed === 1 ? '' : 's'} trimmed`);
    }
    if (result.stats.duplicatesRemoved > 0) {
      parts.push(`${result.stats.duplicatesRemoved} duplicate${result.stats.duplicatesRemoved === 1 ? '' : 's'} removed`);
    }
    return parts.length > 0 ? parts.join(' \u00b7 ') : 'No changes applied';
  }, [result.stats]);

  // ─── Options bar ───────────────────────────────────────────────────────

  const optionsBar = (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Toggle
        checked={options.trimWhitespace}
        onChange={(v) => setOption('trimWhitespace', v)}
        label="Trim whitespace"
      />
      <Toggle
        checked={options.removeEmptyLines}
        onChange={(v) => setOption('removeEmptyLines', v)}
        label="Remove empty lines"
      />
      <Toggle
        checked={options.removeDuplicateLines}
        onChange={(v) => setOption('removeDuplicateLines', v)}
        label="Remove duplicates"
      />
      <Toggle
        checked={options.removeExtraSpaces}
        onChange={(v) => setOption('removeExtraSpaces', v)}
        label="Remove extra spaces"
      />
      <Toggle
        checked={options.stripHtmlTags}
        onChange={(v) => setOption('stripHtmlTags', v)}
        label="Strip HTML tags"
      />
      <Toggle
        checked={options.normalizeLineEndings}
        onChange={(v) => setOption('normalizeLineEndings', v)}
        label="Normalize line endings"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Sort lines
        </span>
        <div className="w-24">
          <Select
            aria-label="Sort direction"
            value={options.sortLines}
            onChange={(e) => setOption('sortLines', e.target.value as CleanupOptions['sortLines'])}
            options={[
              { value: 'none', label: 'None' },
              { value: 'asc', label: 'A \u2192 Z' },
              { value: 'desc', label: 'Z \u2192 A' },
            ]}
          />
        </div>
      </div>
    </div>
  );

  // ─── Input / Output panels ─────────────────────────────────────────────

  const inputPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="text-cleanup-input"
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
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
        id="text-cleanup-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste messy text here..."
        monospace
        showLineNumbers
        spellCheck={false}
        rows={16}
        aria-label="Text to clean up"
      />
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
      <Textarea
        value={result.output}
        readOnly
        monospace
        showLineNumbers
        placeholder="Cleaned text will appear here"
        spellCheck={false}
        rows={16}
        aria-label="Cleaned output"
      />
      <div
        className="text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {statsLine}
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

export default TextCleanup;
