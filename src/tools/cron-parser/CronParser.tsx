import { useMemo, useState } from 'react';
import cronstrue from 'cronstrue';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { meta } from './meta';
import { parseCron, getNextRunTimes, CRON_PRESETS } from './cron';

// ─── Helpers ──────────────────────────────────────────────────────────────

function getHumanDescription(expression: string): { text: string; error: string | null } {
  if (!expression.trim()) return { text: '', error: null };
  try {
    return { text: cronstrue.toString(expression, { verbose: true }), error: null };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

function formatRunTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatRelativeFromNow(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  const remainMins = diffMins % 60;
  if (diffHrs < 24) return `in ${diffHrs}h ${remainMins}m`;
  const diffDays = Math.floor(diffHrs / 24);
  const remainHrs = diffHrs % 24;
  return `in ${diffDays}d ${remainHrs}h`;
}

// ─── Component ────────────────────────────────────────────────────────────

function CronParser() {
  const [expression, setExpression] = useState('');
  const debouncedExpression = useDebounce(expression, 200);

  const presetOptions = useMemo(
    () => [
      { value: '', label: 'Common presets...' },
      ...CRON_PRESETS.map((p) => ({
        value: p.expression,
        label: `${p.label} (${p.expression})`,
      })),
    ],
    [],
  );

  const description = useMemo(
    () => getHumanDescription(debouncedExpression),
    [debouncedExpression],
  );

  const nextRuns = useMemo(() => {
    if (!debouncedExpression.trim()) return { runs: [], error: null };
    try {
      const parsed = parseCron(debouncedExpression);
      return { runs: getNextRunTimes(parsed, 10), error: null };
    } catch (err) {
      return { runs: [], error: err instanceof Error ? err.message : String(err) };
    }
  }, [debouncedExpression]);

  const combinedError = description.error ?? nextRuns.error;
  const isEmpty = !debouncedExpression.trim();

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Input section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Cron Expression"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="e.g. */5 * * * * or 0 9 * * 1-5"
                aria-label="Cron expression"
                className="mono"
              />
            </div>
            <div className="w-60">
              <Select
                label="Presets"
                value=""
                onChange={(e) => {
                  if (e.target.value) setExpression(e.target.value);
                }}
                options={presetOptions}
                aria-label="Select a preset cron expression"
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Format: [second] minute hour day-of-month month day-of-week
          </p>
        </div>

        {/* Error */}
        {combinedError && (
          <div
            className="px-4 py-3 text-sm"
            style={{
              color: 'var(--danger)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-md)',
            }}
            role="alert"
          >
            {combinedError}
          </div>
        )}

        {/* Human-readable description */}
        {description.text && !combinedError && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Description
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {description.text}
              </span>
            </div>
            <CopyButton value={description.text} size="sm" />
          </div>
        )}

        {/* Next run times */}
        {nextRuns.runs.length > 0 && !combinedError && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Next 10 Runs
              </span>
              <CopyButton
                value={nextRuns.runs.map((d) => d.toISOString()).join('\n')}
                label="Copy all"
                size="sm"
              />
            </div>
            <div
              className="overflow-hidden"
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <th
                      className="px-3 py-2 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)' }}
                    >
                      #
                    </th>
                    <th
                      className="px-3 py-2 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)' }}
                    >
                      Date & Time
                    </th>
                    <th
                      className="px-3 py-2 text-right text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)' }}
                    >
                      Relative
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {nextRuns.runs.map((date, i) => (
                    <tr
                      key={date.getTime()}
                      style={{
                        borderBottom:
                          i < nextRuns.runs.length - 1
                            ? '1px solid var(--border-secondary)'
                            : undefined,
                      }}
                    >
                      <td
                        className="px-3 py-2 text-xs tabular-nums"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {i + 1}
                      </td>
                      <td
                        className="mono px-3 py-2 text-xs"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {formatRunTime(date)}
                      </td>
                      <td
                        className="px-3 py-2 text-right text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatRelativeFromNow(date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div
            className="px-4 py-8 text-center text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Enter a cron expression above or select a preset to get started.
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default CronParser;
