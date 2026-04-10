import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import {
  computeDifference,
  addDuration,
  toDateInputValue,
  parseDateInput,
  getDayName,
  getISOWeekNumber,
  formatDateLong,
  type DurationUnit,
} from './dates';

// ─── Persistence ───────────────────────────────────────────────────────────

type Mode = 'difference' | 'add-subtract';

interface DateCalcDefaults {
  mode: Mode;
}

const sanitizeDefaults = (raw: unknown): DateCalcDefaults => {
  if (raw === null || typeof raw !== 'object') return { mode: 'difference' };
  const obj = raw as Record<string, unknown>;
  return {
    mode: obj.mode === 'difference' || obj.mode === 'add-subtract' ? obj.mode : 'difference',
  };
};

// ─── Date info line ────────────────────────────────────────────────────────

function DateInfo({ date }: { date: Date | null }) {
  if (!date) return null;
  return (
    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
      {getDayName(date)} \u00b7 Week {getISOWeekNumber(date)}
    </span>
  );
}

// ─── Tab button ────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium transition-colors duration-150"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        backgroundColor: 'transparent',
      }}
      aria-selected={active}
      role="tab"
    >
      {children}
    </button>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function DateCalculator() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState<Mode>(initial.mode);

  // Difference mode state
  const [date1, setDate1] = useState(toDateInputValue(new Date()));
  const [date2, setDate2] = useState('');

  // Add/subtract mode state
  const [baseDate, setBaseDate] = useState(toDateInputValue(new Date()));
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<DurationUnit>('days');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [businessOnly, setBusinessOnly] = useState(false);

  // Persist mode
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({ toolDefaults: { ...allDefaults, [meta.id]: { mode } satisfies DateCalcDefaults } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const setToday = useCallback((setter: (v: string) => void) => {
    setter(toDateInputValue(new Date()));
  }, []);

  // ─── Difference result ─────────────────────────────────────────────────

  const diff = useMemo(() => {
    const d1 = parseDateInput(date1);
    const d2 = parseDateInput(date2);
    if (!d1 || !d2) return null;
    return computeDifference(d1, d2);
  }, [date1, date2]);

  const parsedDate1 = useMemo(() => parseDateInput(date1), [date1]);
  const parsedDate2 = useMemo(() => parseDateInput(date2), [date2]);

  // ─── Add/subtract result ───────────────────────────────────────────────

  const addResult = useMemo(() => {
    const base = parseDateInput(baseDate);
    const num = parseInt(amount, 10);
    if (!base || !Number.isFinite(num) || num < 0) return null;
    return addDuration(base, num, unit, direction, businessOnly);
  }, [baseDate, amount, unit, direction, businessOnly]);

  const parsedBaseDate = useMemo(() => parseDateInput(baseDate), [baseDate]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Tabs */}
        <div
          className="flex"
          role="tablist"
          aria-label="Calculator mode"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <TabButton active={mode === 'difference'} onClick={() => setMode('difference')}>
            Difference
          </TabButton>
          <TabButton active={mode === 'add-subtract'} onClick={() => setMode('add-subtract')}>
            Add / Subtract
          </TabButton>
        </div>

        {mode === 'difference' && (
          <div className="flex flex-col gap-5">
            {/* Date 1 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Start Date"
                    type="date"
                    value={date1}
                    onChange={(e) => setDate1(e.target.value)}
                    aria-label="Start date"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setToday(setDate1)}
                >
                  Today
                </Button>
              </div>
              <DateInfo date={parsedDate1} />
            </div>

            {/* Date 2 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="End Date"
                    type="date"
                    value={date2}
                    onChange={(e) => setDate2(e.target.value)}
                    aria-label="End date"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setToday(setDate2)}
                >
                  Today
                </Button>
              </div>
              <DateInfo date={parsedDate2} />
            </div>

            {/* Result */}
            {diff && (
              <div
                className="flex flex-col gap-3 p-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div
                  className="text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {diff.years > 0 && `${diff.years} year${diff.years === 1 ? '' : 's'}, `}
                  {diff.months > 0 && `${diff.months} month${diff.months === 1 ? '' : 's'}, `}
                  {diff.days} day{diff.days === 1 ? '' : 's'}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>{diff.totalDays.toLocaleString()} total days</span>
                  <span>{diff.weeks.toLocaleString()} weeks</span>
                  <span>{diff.businessDays.toLocaleString()} business days</span>
                </div>
              </div>
            )}

            {!diff && date1 && date2 && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Enter two valid dates to calculate the difference.
              </div>
            )}

            {!date2 && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Select an end date to calculate the difference.
              </div>
            )}
          </div>
        )}

        {mode === 'add-subtract' && (
          <div className="flex flex-col gap-5">
            {/* Base date */}
            <div className="flex flex-col gap-1">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Start Date"
                    type="date"
                    value={baseDate}
                    onChange={(e) => setBaseDate(e.target.value)}
                    aria-label="Start date"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setToday(setBaseDate)}
                >
                  Today
                </Button>
              </div>
              <DateInfo date={parsedBaseDate} />
            </div>

            {/* Amount + unit + direction */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-20">
                <Select
                  label="Operation"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'add' | 'subtract')}
                  options={[
                    { value: 'add', label: 'Add' },
                    { value: 'subtract', label: 'Subtract' },
                  ]}
                  aria-label="Add or subtract"
                />
              </div>
              <div className="w-24">
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Number of units"
                />
              </div>
              <div className="w-28">
                <Select
                  label="Unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as DurationUnit)}
                  options={[
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months' },
                    { value: 'years', label: 'Years' },
                  ]}
                  aria-label="Duration unit"
                />
              </div>
            </div>

            {/* Business days toggle */}
            {unit === 'days' && (
              <Toggle
                checked={businessOnly}
                onChange={setBusinessOnly}
                label="Business days only"
                description="Skip weekends (Saturday and Sunday)"
              />
            )}

            {/* Result */}
            {addResult && (
              <div
                className="flex flex-col gap-2 p-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div
                  className="text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatDateLong(addResult)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {getDayName(addResult)} \u00b7 Week {getISOWeekNumber(addResult)} \u00b7{' '}
                  {toDateInputValue(addResult)}
                </div>
              </div>
            )}

            {!addResult && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Enter a valid date and amount to calculate.
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default DateCalculator;
