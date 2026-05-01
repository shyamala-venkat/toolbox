import { useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Banner } from '@/components/ui/Banner';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { formatMoney } from '@/lib/format';
import { parseAndValidate, type ValidationResult } from '@/lib/validators';
import { Chart } from '../_lib/Chart';
import { compound, type CompoundResult } from '../_lib/finance-math';
import { meta } from './meta';

const EM_DASH = '—';
const SAFE_WITHDRAWAL_RATE = 0.04;

interface ParseOutcome {
  currentAge: ValidationResult<number>;
  retirementAge: ValidationResult<number>;
  currentSavings: ValidationResult<number>;
  monthlyContribution: ValidationResult<number>;
  expectedReturn: ValidationResult<number>;
}

interface FieldErrors {
  currentAge: string | null;
  retirementAge: string | null;
  currentSavings: string | null;
  monthlyContribution: string | null;
  expectedReturn: string | null;
}

interface ComputedResult {
  result: CompoundResult;
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  expectedReturnPct: number;
  yearsUntilRetirement: number;
  annualWithdrawal: number;
  monthlyWithdrawal: number;
  copyText: string;
}

function parseInputs(
  currentAge: string,
  retirementAge: string,
  currentSavings: string,
  monthlyContribution: string,
  expectedReturn: string,
): ParseOutcome {
  return {
    currentAge: parseAndValidate(currentAge, {
      min: 18,
      max: 80,
      integer: true,
      fieldLabel: 'Current age',
      optional: true,
    }),
    retirementAge: parseAndValidate(retirementAge, {
      // Absolute floor; cross-field validator enforces > currentAge.
      min: 18,
      max: 100,
      integer: true,
      fieldLabel: 'Retirement age',
      optional: true,
    }),
    currentSavings: parseAndValidate(currentSavings, {
      min: 0,
      max: 1e10,
      fieldLabel: 'Current savings',
      optional: true,
    }),
    monthlyContribution: parseAndValidate(monthlyContribution, {
      min: 0,
      max: 1e8,
      fieldLabel: 'Monthly contribution',
      optional: true,
    }),
    expectedReturn: parseAndValidate(expectedReturn, {
      min: 0,
      max: 30,
      fieldLabel: 'Expected return',
      optional: true,
    }),
  };
}

/**
 * Cross-field validation: retirement age must exceed current age. We surface
 * this on the retirement-age field so the user sees the error next to the
 * field that needs to change.
 */
function deriveErrors(parsed: ParseOutcome): FieldErrors {
  const baseErrors: FieldErrors = {
    currentAge: parsed.currentAge.ok ? null : parsed.currentAge.error,
    retirementAge: parsed.retirementAge.ok ? null : parsed.retirementAge.error,
    currentSavings: parsed.currentSavings.ok ? null : parsed.currentSavings.error,
    monthlyContribution: parsed.monthlyContribution.ok
      ? null
      : parsed.monthlyContribution.error,
    expectedReturn: parsed.expectedReturn.ok ? null : parsed.expectedReturn.error,
  };

  // Cross-field check only fires when both ages parsed cleanly.
  if (
    parsed.currentAge.ok &&
    parsed.retirementAge.ok &&
    Number.isFinite(parsed.currentAge.value) &&
    Number.isFinite(parsed.retirementAge.value) &&
    parsed.retirementAge.value <= parsed.currentAge.value
  ) {
    baseErrors.retirementAge =
      'Retirement age must be greater than current age';
  }

  return baseErrors;
}

function compute(parsed: ParseOutcome): ComputedResult | null {
  if (
    !parsed.currentAge.ok ||
    !parsed.retirementAge.ok ||
    !parsed.currentSavings.ok ||
    !parsed.monthlyContribution.ok ||
    !parsed.expectedReturn.ok
  ) {
    return null;
  }

  const currentAge = parsed.currentAge.value;
  const retirementAge = parsed.retirementAge.value;
  if (
    !Number.isFinite(currentAge) ||
    !Number.isFinite(retirementAge) ||
    !Number.isInteger(currentAge) ||
    !Number.isInteger(retirementAge) ||
    retirementAge <= currentAge
  ) {
    return null;
  }

  const yearsUntilRetirement = retirementAge - currentAge;

  const currentSavings = Number.isFinite(parsed.currentSavings.value)
    ? parsed.currentSavings.value
    : 0;
  const monthlyContribution = Number.isFinite(parsed.monthlyContribution.value)
    ? parsed.monthlyContribution.value
    : 0;
  const expectedReturnPct = parsed.expectedReturn.value;

  if (!Number.isFinite(expectedReturnPct)) return null;
  if (currentSavings <= 0 && monthlyContribution <= 0) return null;

  let result: CompoundResult;
  try {
    result = compound(
      currentSavings,
      expectedReturnPct / 100,
      monthlyContribution,
      yearsUntilRetirement,
    );
  } catch {
    return null;
  }

  const annualWithdrawal = result.finalValue * SAFE_WITHDRAWAL_RATE;
  const monthlyWithdrawal = annualWithdrawal / 12;

  const copyText =
    `Retirement projection: ${formatMoney(result.finalValue)} at age ${retirementAge} ` +
    `(over ${yearsUntilRetirement} ${yearsUntilRetirement === 1 ? 'year' : 'years'} from age ${currentAge}, ` +
    `contributing ${formatMoney(monthlyContribution)}/mo at ${expectedReturnPct}% return). ` +
    `4% rule: ${formatMoney(annualWithdrawal)}/yr or ${formatMoney(monthlyWithdrawal)}/mo (deterministic projection, not a forecast).`;

  return {
    result,
    currentAge,
    retirementAge,
    currentSavings,
    monthlyContribution,
    expectedReturnPct,
    yearsUntilRetirement,
    annualWithdrawal,
    monthlyWithdrawal,
    copyText,
  };
}

function formatYearLabel(n: number): string {
  return `Year ${n}`;
}

function Retirement() {
  const [currentAgeRaw, setCurrentAgeRaw] = useState('');
  const [retirementAgeRaw, setRetirementAgeRaw] = useState('');
  const [currentSavingsRaw, setCurrentSavingsRaw] = useState('');
  const [monthlyContributionRaw, setMonthlyContributionRaw] = useState('');
  const [expectedReturnRaw, setExpectedReturnRaw] = useState('');
  const [showYearly, setShowYearly] = useState(false);

  const debouncedCurrentAge = useDebounce(currentAgeRaw, 150);
  const debouncedRetirementAge = useDebounce(retirementAgeRaw, 150);
  const debouncedSavings = useDebounce(currentSavingsRaw, 150);
  const debouncedContribution = useDebounce(monthlyContributionRaw, 150);
  const debouncedReturn = useDebounce(expectedReturnRaw, 150);

  const parsed = useMemo(
    () =>
      parseInputs(
        debouncedCurrentAge,
        debouncedRetirementAge,
        debouncedSavings,
        debouncedContribution,
        debouncedReturn,
      ),
    [
      debouncedCurrentAge,
      debouncedRetirementAge,
      debouncedSavings,
      debouncedContribution,
      debouncedReturn,
    ],
  );
  const errors = useMemo(() => deriveErrors(parsed), [parsed]);
  const computed = useMemo(() => compute(parsed), [parsed]);

  const isEmpty = computed === null;

  const chartX = useMemo(
    () => (computed ? computed.result.yearly.map((row) => row.year) : []),
    [computed],
  );
  const chartSeries = useMemo(
    () =>
      computed
        ? [
            {
              label: 'Total contributed',
              values: computed.result.yearly.map((r) => r.contributedToDate),
            },
            {
              label: 'Total balance',
              values: computed.result.yearly.map((r) => r.balance),
            },
          ]
        : [],
    [computed],
  );

  const chartAriaLabel = computed
    ? `Portfolio growth from age ${computed.currentAge} to age ${computed.retirementAge}. Final balance ${formatMoney(computed.result.finalValue)}.`
    : 'Portfolio growth chart. Enter inputs to populate.';

  const totalContributedNet = computed
    ? computed.result.totalContributed - computed.currentSavings
    : 0;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── Persistent disclaimer banner (mandatory, always visible) ── */}
        <Banner
          tone="note"
          title="Deterministic projection"
          detail="Assumes constant returns. Real markets vary; this is not a forecast and does not model inflation, taxes, or sequence-of-returns risk."
        />

        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Current age"
            value={currentAgeRaw}
            onChange={(e) => setCurrentAgeRaw(e.target.value)}
            placeholder="30"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Current age"
            error={errors.currentAge ?? undefined}
          />
          <Input
            label="Retirement age"
            value={retirementAgeRaw}
            onChange={(e) => setRetirementAgeRaw(e.target.value)}
            placeholder="65"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Retirement age"
            error={errors.retirementAge ?? undefined}
          />
          <Input
            label="Expected annual return"
            value={expectedReturnRaw}
            onChange={(e) => setExpectedReturnRaw(e.target.value)}
            placeholder="7"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Expected annual return"
            trailingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                %
              </span>
            }
            error={errors.expectedReturn ?? undefined}
          />
          <Input
            label="Current savings"
            value={currentSavingsRaw}
            onChange={(e) => setCurrentSavingsRaw(e.target.value)}
            placeholder="10,000"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Current savings"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.currentSavings ?? undefined}
          />
          <Input
            label="Monthly contribution"
            value={monthlyContributionRaw}
            onChange={(e) => setMonthlyContributionRaw(e.target.value)}
            placeholder="500"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Monthly contribution"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.monthlyContribution ?? undefined}
          />
        </div>

        {/* ─── Result block ───────────────────────────────────────────── */}
        <section
          aria-live="polite"
          className="flex flex-col gap-3 px-5 py-5"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Portfolio at retirement
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Portfolio at retirement"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.finalValue)}
              </span>
            </div>
            <CopyButton
              value={computed?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          <div
            className="flex flex-col gap-1 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>
              Total contributed:{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(totalContributedNet)}
              </span>
            </span>
            <span>
              Total earned:{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.totalEarned)}
              </span>
            </span>
            <span>
              Years until retirement:{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : computed.yearsUntilRetirement}
              </span>
            </span>
          </div>
        </section>

        {/* ─── 4% rule heuristic block ────────────────────────────────── */}
        {!isEmpty && (
          <section
            aria-label="4 percent rule heuristic"
            className="flex flex-col gap-2 px-5 py-4"
            style={{
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                4% rule heuristic
              </span>
              <span
                className="text-xs italic"
                style={{ color: 'var(--text-tertiary)' }}
              >
                A simplified retirement-feasibility check, not a guarantee.
              </span>
            </div>
            <div
              className="flex flex-col gap-1 text-sm tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              <span aria-label="Annual withdrawal at 4 percent">
                {formatMoney(computed.annualWithdrawal)} annual withdrawal at
                4% of portfolio
              </span>
              <span
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Monthly equivalent at 4 percent"
              >
                {formatMoney(computed.monthlyWithdrawal)} monthly equivalent
              </span>
            </div>
          </section>
        )}

        {/* ─── Chart ──────────────────────────────────────────────────── */}
        <Chart
          xValues={chartX}
          series={chartSeries}
          formatY={(v) => formatMoney(v)}
          formatX={formatYearLabel}
          ariaLabel={chartAriaLabel}
        />

        {/* ─── Yearly breakdown (collapsed) ───────────────────────────── */}
        {!isEmpty && (
          <details
            open={showYearly}
            onToggle={(e) => setShowYearly((e.target as HTMLDetailsElement).open)}
          >
            <summary
              className="cursor-pointer text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showYearly ? 'Hide yearly breakdown' : 'Show yearly breakdown'}
            </summary>
            <div
              className="mt-3 overflow-auto"
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '420px',
              }}
            >
              <table
                className="w-full text-xs tabular-nums"
                aria-label="Yearly portfolio breakdown"
              >
                <thead
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Year
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Age
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Balance
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Contributed
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Earned
                    </th>
                  </tr>
                </thead>
                <tbody style={{ color: 'var(--text-primary)' }}>
                  {computed.result.yearly.map((row) => (
                    <tr
                      key={row.year}
                      style={{ borderTop: '1px solid var(--border-secondary)' }}
                    >
                      <td className="px-3 py-1.5">{row.year}</td>
                      <td className="px-3 py-1.5">
                        {computed.currentAge + row.year}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.balance)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.contributedToDate)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.earnedToDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All calculations run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default Retirement;
