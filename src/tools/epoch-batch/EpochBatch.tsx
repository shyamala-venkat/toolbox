import { useCallback, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';
import {
  formatISO8601,
  formatInTimezone,
  formatRelative,
} from '@/tools/timestamp-converter/format';

// ─── Types & helpers ──────────────────────────────────────────────────────

interface ConvertedRow {
  raw: string;
  date: Date | null;
  iso: string;
  local: string;
  relative: string;
  format: 'seconds' | 'milliseconds' | 'invalid';
}

function detectAndConvert(line: string): ConvertedRow {
  const trimmed = line.trim();
  if (!trimmed) {
    return { raw: trimmed, date: null, iso: '', local: '', relative: '', format: 'invalid' };
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return { raw: trimmed, date: null, iso: '', local: '', relative: '', format: 'invalid' };
  }

  // Auto-detect: 13+ digits = milliseconds, 10 digits = seconds
  const digits = trimmed.replace(/[^0-9]/g, '').length;
  const isMs = digits >= 13;
  const ms = isMs ? num : num * 1000;

  // Sanity check: reject dates way outside reasonable range
  // (before year 1970 or after year 3000)
  if (ms < 0 || ms > 32503680000000) {
    return { raw: trimmed, date: null, iso: '', local: '', relative: '', format: 'invalid' };
  }

  const date = new Date(ms);
  if (isNaN(date.getTime())) {
    return { raw: trimmed, date: null, iso: '', local: '', relative: '', format: 'invalid' };
  }

  const now = new Date();
  return {
    raw: trimmed,
    date,
    iso: formatISO8601(date),
    local: formatInTimezone(date, 'local'),
    relative: formatRelative(date, now),
    format: isMs ? 'milliseconds' : 'seconds',
  };
}

function rowsToCsv(rows: ConvertedRow[]): string {
  const header = 'Input,Format,ISO 8601,Local Time,Relative';
  const lines = rows.map((r) => {
    if (!r.date) return `"${r.raw}",invalid,,,`;
    return `"${r.raw}",${r.format},"${r.iso}","${r.local}","${r.relative}"`;
  });
  return [header, ...lines].join('\n');
}

function rowsToText(rows: ConvertedRow[]): string {
  return rows
    .map((r) => {
      if (!r.date) return `${r.raw} -> invalid`;
      return `${r.raw} (${r.format}) -> ${r.iso} | ${r.local} | ${r.relative}`;
    })
    .join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────

function EpochBatch() {
  const [input, setInput] = useState('');
  const debouncedInput = useDebounce(input, 150);

  const rows = useMemo(() => {
    if (!debouncedInput.trim()) return [];
    return debouncedInput
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map(detectAndConvert);
  }, [debouncedInput]);

  const validCount = rows.filter((r) => r.date !== null).length;
  const invalidCount = rows.filter((r) => r.date === null).length;

  const csvOutput = useMemo(() => (rows.length > 0 ? rowsToCsv(rows) : ''), [rows]);
  const textOutput = useMemo(() => (rows.length > 0 ? rowsToText(rows) : ''), [rows]);

  const handleAddNow = useCallback(() => {
    const now = Math.floor(Date.now() / 1000).toString();
    setInput((prev) => (prev.trim() ? `${prev}\n${now}` : now));
  }, []);

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-6">
        {/* Input section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Timestamps (one per line)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddNow}
              >
                Now
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInput('')}
                disabled={!input}
              >
                Clear
              </Button>
            </div>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              'Paste Unix timestamps, one per line:\n1609459200\n1609459200000\n1700000000'
            }
            monospace
            rows={6}
            spellCheck={false}
            aria-label="Unix timestamps input"
          />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Auto-detects seconds (10 digits) vs milliseconds (13 digits) per line.
          </p>
        </div>

        {/* Results */}
        {rows.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Results
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {' '}({validCount} converted
                  {invalidCount > 0 && `, ${invalidCount} invalid`})
                </span>
              </span>
              <div className="flex items-center gap-2">
                <CopyButton value={csvOutput} label="Copy CSV" size="sm" />
                <CopyButton value={textOutput} label="Copy text" size="sm" variant="ghost" />
              </div>
            </div>

            <div
              className="overflow-x-auto"
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    {['Input', 'Format', 'ISO 8601', 'Local Time', 'Relative'].map(
                      (header) => (
                        <th
                          key={header}
                          className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium"
                          style={{
                            color: 'var(--text-tertiary)',
                            borderBottom: '1px solid var(--border-primary)',
                          }}
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${row.raw}-${i}`}
                      style={{
                        borderBottom:
                          i < rows.length - 1
                            ? '1px solid var(--border-secondary)'
                            : undefined,
                      }}
                    >
                      <td
                        className="mono whitespace-nowrap px-3 py-2 text-xs"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {row.raw}
                      </td>
                      {row.date ? (
                        <>
                          <td
                            className="whitespace-nowrap px-3 py-2 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {row.format === 'seconds' ? 'sec' : 'ms'}
                          </td>
                          <td
                            className="mono whitespace-nowrap px-3 py-2 text-xs"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {row.iso}
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-2 text-xs"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {row.local}
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-2 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {row.relative}
                          </td>
                        </>
                      ) : (
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-xs"
                          style={{ color: 'var(--danger)' }}
                        >
                          Invalid timestamp
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {rows.length === 0 && (
          <div
            className="px-4 py-8 text-center text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Paste Unix timestamps above (one per line) to convert them all at once.
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default EpochBatch;
