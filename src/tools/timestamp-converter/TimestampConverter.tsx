import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { AlertCircle, CalendarClock } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import { parseTimestamp, describeKind, type ParseResult } from './parse';
import {
  TIMEZONE_OPTIONS,
  formatUnixSeconds,
  formatUnixMilliseconds,
  formatISO8601,
  formatUtcReadable,
  formatInTimezone,
  formatRelative,
  isValidTimezone,
  getSystemTimezoneName,
} from './format';
import { TimestampRow } from './TimestampRow';

// ─── Defaults ────────────────────────────────────────────────────────────────

interface TimestampConverterDefaults {
  timezone: string;
}

const DEFAULTS: TimestampConverterDefaults = {
  timezone: 'local',
};

// ─── Component ───────────────────────────────────────────────────────────────

// Defense-in-depth: a manually edited preferences.json could pass anything
// for `timezone`. Bound the length so we don't ship absurd strings into
// `Intl.DateTimeFormat`, then verify the zone actually parses; on any
// failure, silently fall back to the hard-coded default.
const sanitizeTimezone = (raw: unknown): string => {
  if (typeof raw !== 'string') return DEFAULTS.timezone;
  if (raw.length === 0 || raw.length > 100) return DEFAULTS.timezone;
  return isValidTimezone(raw) ? raw : DEFAULTS.timezone;
};

function TimestampConverter() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here. Zustand
  // compares the returned reference, and `settingsStore.update()` creates a
  // fresh nested object only for the tool that actually changed.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initialTimezone = useMemo<string>(() => {
    if (stored !== null && typeof stored === 'object') {
      return sanitizeTimezone((stored as Record<string, unknown>).timezone);
    }
    return DEFAULTS.timezone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [input, setInput] = useState<string>('');
  const [timezone, setTimezone] = useState<string>(initialTimezone);
  // `now` is used as the reference point for relative-time formatting; we
  // refresh it every 30 s so labels like "2 minutes ago" stay live without
  // re-parsing input on every tick.
  const [now, setNow] = useState<Date>(() => new Date());

  const debouncedInput = useDebounce(input, 150);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Persist timezone after the first mount snapshot. We read `toolDefaults`
  // from the live store via `getState()` so this component doesn't subscribe
  // to the whole map.
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
        [meta.id]: { timezone },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  const result: ParseResult = useMemo(
    () => parseTimestamp(debouncedInput),
    [debouncedInput],
  );

  const handleNow = useCallback(() => {
    setInput(Math.floor(Date.now() / 1000).toString());
  }, []);

  const handleClear = useCallback(() => setInput(''), []);

  const systemZone = useMemo(() => getSystemTimezoneName(), []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const inputCard = (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <Input
            label="Timestamp or date"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1712592000  ·  2024-04-08T12:00:00Z  ·  next Friday"
            spellCheck={false}
            autoComplete="off"
            leadingIcon={<CalendarClock className="h-4 w-4" />}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" size="md" onClick={handleNow}>
            Now
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClear}
            disabled={input.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="sm:max-w-xs sm:flex-1">
          <Select
            label="Display timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            options={TIMEZONE_OPTIONS.map((o) =>
              o.value === 'local' ? { ...o, label: `Local (${systemZone})` } : o,
            )}
          />
        </div>
      </div>
    </div>
  );

  let resultsPanel: ReactElement;

  if (debouncedInput.trim().length === 0) {
    resultsPanel = (
      <div
        className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <CalendarClock
          className="h-6 w-6"
          style={{ color: 'var(--text-tertiary)' }}
          aria-hidden="true"
        />
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Enter a timestamp to convert
        </p>
        <p className="max-w-md text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Accepts Unix seconds, Unix milliseconds, ISO 8601, or natural-language dates
          like &ldquo;tomorrow&rdquo; or &ldquo;next Monday at 3pm&rdquo;.
        </p>
      </div>
    );
  } else if (!result.ok) {
    resultsPanel = (
      <div
        className="flex flex-col gap-2 px-4 py-3"
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
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Could not parse input
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Try a Unix timestamp (e.g. <code className="mono">1712592000</code>), an ISO 8601
          date (<code className="mono">2024-04-08T12:00:00Z</code>), or a natural-language
          date.
        </p>
      </div>
    );
  } else {
    const { date, kind } = result;
    resultsPanel = (
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>Conversions</span>
          <span
            className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] font-medium uppercase"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent)',
            }}
          >
            Detected: {describeKind(kind)}
          </span>
        </div>

        <TimestampRow label="Unix s" value={formatUnixSeconds(date)} hint="seconds since epoch" />
        <TimestampRow
          label="Unix ms"
          value={formatUnixMilliseconds(date)}
          hint="milliseconds since epoch"
        />
        <TimestampRow label="ISO 8601" value={formatISO8601(date)} hint="UTC" />
        <TimestampRow
          label="Local"
          value={formatInTimezone(date, timezone)}
          hint={timezone === 'local' ? systemZone : timezone}
        />
        <TimestampRow label="UTC string" value={formatUtcReadable(date)} hint="RFC 7231" />
        <TimestampRow
          label="Relative"
          value={formatRelative(date, now)}
          hint="from now"
        />
      </div>
    );
  }

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-4">
        {inputCard}
        {resultsPanel}
      </div>
    </ToolPage>
  );
}

export default TimestampConverter;
