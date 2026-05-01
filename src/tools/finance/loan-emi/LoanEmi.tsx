import { useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Banner } from '@/components/ui/Banner';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { formatMoney } from '@/lib/format';
import { parseAndValidate, type ValidationResult } from '@/lib/validators';
import { Chart } from '../_lib/Chart';
import { amortize, type AmortizationResult } from '../_lib/finance-math';
import { meta } from './meta';

const EM_DASH = '—';

type TermUnit = 'months' | 'years';

interface ParseOutcome {
  principal: ValidationResult<number>;
  rate: ValidationResult<number>;
  term: ValidationResult<number>;
}

interface FieldErrors {
  principal: string | null;
  rate: string | null;
  term: string | null;
}

interface ComputedResult {
  result: AmortizationResult;
  principal: number;
  ratePct: number;
  termMonths: number;
  totalPaid: number;
  copyText: string;
  isZeroRate: boolean;
}

function maxTermForUnit(unit: TermUnit): number {
  // 600 months ≡ 50 years, matching the spec's term cap. We let the user
  // pick a unit but always validate against months internally.
  return unit === 'years' ? 50 : 600;
}

function parseInputs(
  principal: string,
  rate: string,
  term: string,
  unit: TermUnit,
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
      fieldLabel: 'Annual rate',
      optional: true,
    }),
    term: parseAndValidate(term, {
      min: 1,
      max: maxTermForUnit(unit),
      integer: true,
      fieldLabel: unit === 'years' ? 'Term (years)' : 'Term (months)',
      optional: true,
    }),
  };
}

function deriveErrors(parsed: ParseOutcome): FieldErrors {
  return {
    principal: parsed.principal.ok ? null : parsed.principal.error,
    rate: parsed.rate.ok ? null : parsed.rate.error,
    term: parsed.term.ok ? null : parsed.term.error,
  };
}

function compute(parsed: ParseOutcome, unit: TermUnit): ComputedResult | null {
  if (!parsed.principal.ok || !parsed.rate.ok || !parsed.term.ok) return null;
  const principal = parsed.principal.value;
  const ratePct = parsed.rate.value;
  const termRaw = parsed.term.value;

  if (
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isFinite(ratePct) ||
    !Number.isFinite(termRaw) ||
    termRaw <= 0
  ) {
    return null;
  }

  const termMonths = unit === 'years' ? Math.round(termRaw * 12) : termRaw;
  if (!Number.isInteger(termMonths) || termMonths < 1) return null;

  let result: AmortizationResult;
  try {
    result = amortize(principal, ratePct / 100, termMonths);
  } catch {
    return null;
  }

  const totalPaid = principal + result.totalInterest;
  const isZeroRate = ratePct === 0;
  const copyText =
    `Monthly payment: ${formatMoney(result.monthlyPayment)} ` +
    `(principal ${formatMoney(principal)}, rate ${ratePct}%, term ${termMonths} months ` +
    `— total interest ${formatMoney(result.totalInterest)}, total paid ${formatMoney(totalPaid)})`;

  return {
    result,
    principal,
    ratePct,
    termMonths,
    totalPaid,
    copyText,
    isZeroRate,
  };
}

function formatMonthLabel(n: number): string {
  return `Month ${n}`;
}

function LoanEmi() {
  const [principalRaw, setPrincipalRaw] = useState('');
  const [rateRaw, setRateRaw] = useState('');
  const [termRaw, setTermRaw] = useState('');
  const [termUnit, setTermUnit] = useState<TermUnit>('years');
  const [showSchedule, setShowSchedule] = useState(false);

  const debouncedPrincipal = useDebounce(principalRaw, 150);
  const debouncedRate = useDebounce(rateRaw, 150);
  const debouncedTerm = useDebounce(termRaw, 150);

  const parsed = useMemo(
    () => parseInputs(debouncedPrincipal, debouncedRate, debouncedTerm, termUnit),
    [debouncedPrincipal, debouncedRate, debouncedTerm, termUnit],
  );
  const errors = useMemo(() => deriveErrors(parsed), [parsed]);
  const computed = useMemo(() => compute(parsed, termUnit), [parsed, termUnit]);

  const isEmpty = computed === null;

  // Chart data: month index 1..N on x; remaining balance on y. When empty,
  // we pass an empty x/series so the chart renders axes only.
  const chartX = useMemo(
    () => (computed ? computed.result.schedule.map((row) => row.period) : []),
    [computed],
  );
  const chartSeries = useMemo(
    () =>
      computed
        ? [
            {
              label: 'Remaining balance',
              values: computed.result.schedule.map((row) => row.balance),
            },
          ]
        : [],
    [computed],
  );

  const chartAriaLabel = computed
    ? `Loan balance over time. Starts at ${formatMoney(computed.principal)} principal, decreases to zero at month ${computed.termMonths}.`
    : 'Loan balance chart. Enter inputs to populate.';

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Principal"
            value={principalRaw}
            onChange={(e) => setPrincipalRaw(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Principal"
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
            label="Annual rate"
            value={rateRaw}
            onChange={(e) => setRateRaw(e.target.value)}
            placeholder="6.25"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Annual rate"
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
            label="Term"
            value={termRaw}
            onChange={(e) => setTermRaw(e.target.value)}
            placeholder={termUnit === 'years' ? '30' : '360'}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Term"
            error={errors.term ?? undefined}
          />
          <Select
            label="Term unit"
            value={termUnit}
            onChange={(e) => setTermUnit(e.target.value as TermUnit)}
            aria-label="Term unit"
            options={[
              { value: 'years', label: 'Years' },
              { value: 'months', label: 'Months' },
            ]}
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
                Monthly payment
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Monthly payment amount"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.monthlyPayment)}
              </span>
            </div>
            <CopyButton
              value={computed?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          <div
            className="flex flex-wrap gap-x-6 gap-y-1 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>
              Total interest:{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.totalInterest)}
              </span>
            </span>
            <span>
              Total paid:{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(computed.totalPaid)}
              </span>
            </span>
          </div>
        </section>

        {/* ─── Zero-rate banner ───────────────────────────────────────── */}
        {!isEmpty && computed.isZeroRate && (
          <Banner
            tone="info"
            title="0% interest"
            detail="Straight-line amortization — principal is divided evenly across the term."
          />
        )}

        {/* ─── Chart ──────────────────────────────────────────────────── */}
        <Chart
          xValues={chartX}
          series={chartSeries}
          formatY={(v) => formatMoney(v)}
          formatX={formatMonthLabel}
          ariaLabel={chartAriaLabel}
        />

        {/* ─── Amortization schedule (collapsed) ──────────────────────── */}
        {!isEmpty && (
          <details
            open={showSchedule}
            onToggle={(e) => setShowSchedule((e.target as HTMLDetailsElement).open)}
          >
            <summary
              className="cursor-pointer text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showSchedule ? 'Hide full schedule' : 'Show full schedule'}
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
                aria-label="Amortization schedule"
              >
                <thead
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Period
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Principal
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Interest
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody style={{ color: 'var(--text-primary)' }}>
                  {computed.result.schedule.map((row) => (
                    <tr
                      key={row.period}
                      style={{ borderTop: '1px solid var(--border-secondary)' }}
                    >
                      <td className="px-3 py-1.5">{row.period}</td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.principal)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.interest)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {formatMoney(row.balance)}
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

export default LoanEmi;
