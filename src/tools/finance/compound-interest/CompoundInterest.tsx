import { useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { formatMoney } from '@/lib/format';
import { parseAndValidate, type ValidationResult } from '@/lib/validators';
import { Chart } from '../_lib/Chart';
import { compound, type CompoundResult } from '../_lib/finance-math';
import { meta } from './meta';

const EM_DASH = '—';
const DEFAULT_CONTRIBUTION = '0';

interface ParseOutcome {
  principal: ValidationResult<number>;
  rate: ValidationResult<number>;
  contribution: ValidationResult<number>;
  years: ValidationResult<number>;
}

interface FieldErrors {
  principal: string | null;
  rate: string | null;
  contribution: string | null;
  years: string | null;
}

interface ComputedResult {
  result: CompoundResult;
  principal: number;
  ratePct: number;
  contribution: number;
  years: number;
  multiplier: number;
  copyText: string;
}

function parseInputs(
  principal: string,
  rate: string,
  contribution: string,
  years: string,
): ParseOutcome {
  return {
    principal: parseAndValidate(principal, {
      min: 0,
      max: 1e10,
      fieldLabel: 'Principal',
      optional: true,
    }),
    rate: parseAndValidate(rate, {
      min: 0,
      max: 100,
      fieldLabel: 'Annual return',
      optional: true,
    }),
    contribution: parseAndValidate(contribution, {
      min: 0,
      max: 1e8,
      fieldLabel: 'Monthly contribution',
      optional: true,
    }),
    years: parseAndValidate(years, {
      min: 1,
      max: 80,
      integer: true,
      fieldLabel: 'Years',
      optional: true,
    }),
  };
}

function deriveErrors(parsed: ParseOutcome): FieldErrors {
  return {
    principal: parsed.principal.ok ? null : parsed.principal.error,
    rate: parsed.rate.ok ? null : parsed.rate.error,
    contribution: parsed.contribution.ok ? null : parsed.contribution.error,
    years: parsed.years.ok ? null : parsed.years.error,
  };
}

function compute(parsed: ParseOutcome): ComputedResult | null {
  if (
    !parsed.principal.ok ||
    !parsed.rate.ok ||
    !parsed.contribution.ok ||
    !parsed.years.ok
  ) {
    return null;
  }

  // Optional fields return NaN for empty input. Treat principal/contribution
  // as 0 if not entered; rate and years are required signals of intent.
  const principal = Number.isFinite(parsed.principal.value)
    ? parsed.principal.value
    : 0;
  const ratePct = parsed.rate.value;
  const contribution = Number.isFinite(parsed.contribution.value)
    ? parsed.contribution.value
    : 0;
  const years = parsed.years.value;

  if (!Number.isFinite(ratePct) || !Number.isFinite(years)) return null;
  if (years <= 0 || !Number.isInteger(years)) return null;
  if (principal <= 0 && contribution <= 0) return null;

  let result: CompoundResult;
  try {
    result = compound(principal, ratePct / 100, contribution, years);
  } catch {
    return null;
  }

  const multiplier =
    result.totalContributed > 0
      ? result.finalValue / result.totalContributed
      : 0;

  const copyText =
    `After ${years} ${years === 1 ? 'year' : 'years'}: ` +
    `final value ${formatMoney(result.finalValue)} ` +
    `(principal ${formatMoney(principal)} + contributed ${formatMoney(result.totalContributed - principal)} ` +
    `+ earned ${formatMoney(result.totalEarned)} at ${ratePct}% annual)`;

  return {
    result,
    principal,
    ratePct,
    contribution,
    years,
    multiplier,
    copyText,
  };
}

function formatYearLabel(n: number): string {
  return `Year ${n}`;
}

function CompoundInterest() {
  const [principalRaw, setPrincipalRaw] = useState('');
  const [rateRaw, setRateRaw] = useState('');
  const [contributionRaw, setContributionRaw] = useState(DEFAULT_CONTRIBUTION);
  const [yearsRaw, setYearsRaw] = useState('');
  const [showYearly, setShowYearly] = useState(false);

  const debouncedPrincipal = useDebounce(principalRaw, 150);
  const debouncedRate = useDebounce(rateRaw, 150);
  const debouncedContribution = useDebounce(contributionRaw, 150);
  const debouncedYears = useDebounce(yearsRaw, 150);

  const parsed = useMemo(
    () =>
      parseInputs(
        debouncedPrincipal,
        debouncedRate,
        debouncedContribution,
        debouncedYears,
      ),
    [
      debouncedPrincipal,
      debouncedRate,
      debouncedContribution,
      debouncedYears,
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
    ? `Investment growth. Final value ${formatMoney(computed.result.finalValue)} after ${computed.years} ${computed.years === 1 ? 'year' : 'years'}. Earnings shown above contributed amount.`
    : 'Investment growth chart. Enter inputs to populate.';

  const totalContributedNet = computed
    ? computed.result.totalContributed - computed.principal
    : 0;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Starting principal"
            value={principalRaw}
            onChange={(e) => setPrincipalRaw(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Starting principal"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.principal ?? undefined}
          />
          <Input
            label="Annual return"
            value={rateRaw}
            onChange={(e) => setRateRaw(e.target.value)}
            placeholder="7"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Annual return"
            trailingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                %
              </span>
            }
            error={errors.rate ?? undefined}
          />
          <Input
            label="Monthly contribution"
            value={contributionRaw}
            onChange={(e) => setContributionRaw(e.target.value)}
            placeholder="0"
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
            error={errors.contribution ?? undefined}
          />
          <Input
            label="Years"
            value={yearsRaw}
            onChange={(e) => setYearsRaw(e.target.value)}
            placeholder="20"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Years"
            error={errors.years ?? undefined}
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
                Final value
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Final value"
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
                {isEmpty
                  ? EM_DASH
                  : formatMoney(totalContributedNet)}
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
              {isEmpty || computed.multiplier <= 0
                ? `Multiplier: ${EM_DASH}`
                : `Final value is ${computed.multiplier.toFixed(2)}× total contributed`}
            </span>
          </div>
        </section>

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
                aria-label="Yearly compound breakdown"
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

export default CompoundInterest;
