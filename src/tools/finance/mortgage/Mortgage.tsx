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
  loanAmount: ValidationResult<number>;
  rate: ValidationResult<number>;
  term: ValidationResult<number>;
  annualTax: ValidationResult<number>;
  annualInsurance: ValidationResult<number>;
}

interface FieldErrors {
  loanAmount: string | null;
  rate: string | null;
  term: string | null;
  annualTax: string | null;
  annualInsurance: string | null;
}

interface ComputedResult {
  result: AmortizationResult;
  loanAmount: number;
  ratePct: number;
  termMonths: number;
  termYears: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyEscrow: number;
  totalMonthly: number;
  totalPaid: number;
  copyText: string;
  isZeroRate: boolean;
}

function maxTermForUnit(unit: TermUnit): number {
  // 600 months ≡ 50 years, matching the spec's term cap.
  return unit === 'years' ? 50 : 600;
}

function parseInputs(
  loanAmount: string,
  rate: string,
  term: string,
  unit: TermUnit,
  annualTax: string,
  annualInsurance: string,
): ParseOutcome {
  return {
    loanAmount: parseAndValidate(loanAmount, {
      min: 0,
      max: 1e10,
      fieldLabel: 'Loan amount',
      optional: true,
    }),
    rate: parseAndValidate(rate, {
      min: 0,
      // Mortgage rates are tightly bounded; 30 is a generous cap.
      max: 30,
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
    annualTax: parseAndValidate(annualTax, {
      min: 0,
      max: 1e6,
      fieldLabel: 'Annual property tax',
      optional: true,
    }),
    annualInsurance: parseAndValidate(annualInsurance, {
      min: 0,
      max: 1e6,
      fieldLabel: 'Annual insurance',
      optional: true,
    }),
  };
}

function deriveErrors(parsed: ParseOutcome): FieldErrors {
  return {
    loanAmount: parsed.loanAmount.ok ? null : parsed.loanAmount.error,
    rate: parsed.rate.ok ? null : parsed.rate.error,
    term: parsed.term.ok ? null : parsed.term.error,
    annualTax: parsed.annualTax.ok ? null : parsed.annualTax.error,
    annualInsurance: parsed.annualInsurance.ok ? null : parsed.annualInsurance.error,
  };
}

function compute(parsed: ParseOutcome, unit: TermUnit): ComputedResult | null {
  if (
    !parsed.loanAmount.ok ||
    !parsed.rate.ok ||
    !parsed.term.ok ||
    !parsed.annualTax.ok ||
    !parsed.annualInsurance.ok
  ) {
    return null;
  }

  const loanAmount = parsed.loanAmount.value;
  const ratePct = parsed.rate.value;
  const termRaw = parsed.term.value;

  if (
    !Number.isFinite(loanAmount) ||
    loanAmount <= 0 ||
    !Number.isFinite(ratePct) ||
    !Number.isFinite(termRaw) ||
    termRaw <= 0
  ) {
    return null;
  }

  const termMonths = unit === 'years' ? Math.round(termRaw * 12) : termRaw;
  if (!Number.isInteger(termMonths) || termMonths < 1) return null;
  const termYears = termMonths / 12;

  let result: AmortizationResult;
  try {
    result = amortize(loanAmount, ratePct / 100, termMonths);
  } catch {
    return null;
  }

  // Optional fields return NaN for empty input — treat as 0.
  const annualTax = Number.isFinite(parsed.annualTax.value)
    ? parsed.annualTax.value
    : 0;
  const annualInsurance = Number.isFinite(parsed.annualInsurance.value)
    ? parsed.annualInsurance.value
    : 0;

  const monthlyTax = annualTax / 12;
  const monthlyInsurance = annualInsurance / 12;
  const monthlyEscrow = monthlyTax + monthlyInsurance;
  const totalMonthly = result.monthlyPayment + monthlyEscrow;
  const totalPaid = loanAmount + result.totalInterest + (monthlyEscrow * termMonths);
  const isZeroRate = ratePct === 0;

  const taxPart = annualTax > 0 ? ` + tax ${formatMoney(monthlyTax)}` : '';
  const insPart =
    annualInsurance > 0 ? ` + insurance ${formatMoney(monthlyInsurance)}` : '';
  const termLabel =
    unit === 'years'
      ? `${termYears} ${termYears === 1 ? 'year' : 'years'}`
      : `${termMonths} months`;
  const copyText =
    `Mortgage estimate: ${formatMoney(totalMonthly)}/mo ` +
    `(P&I ${formatMoney(result.monthlyPayment)}${taxPart}${insPart}) ` +
    `on ${formatMoney(loanAmount)} at ${ratePct}% for ${termLabel} ` +
    `— total interest ${formatMoney(result.totalInterest)} (estimate only).`;

  return {
    result,
    loanAmount,
    ratePct,
    termMonths,
    termYears,
    monthlyTax,
    monthlyInsurance,
    monthlyEscrow,
    totalMonthly,
    totalPaid,
    copyText,
    isZeroRate,
  };
}

function formatMonthLabel(n: number): string {
  return `Month ${n}`;
}

function Mortgage() {
  const [loanAmountRaw, setLoanAmountRaw] = useState('');
  const [rateRaw, setRateRaw] = useState('');
  const [termRaw, setTermRaw] = useState('');
  const [termUnit, setTermUnit] = useState<TermUnit>('years');
  const [annualTaxRaw, setAnnualTaxRaw] = useState('');
  const [annualInsuranceRaw, setAnnualInsuranceRaw] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  const debouncedLoan = useDebounce(loanAmountRaw, 150);
  const debouncedRate = useDebounce(rateRaw, 150);
  const debouncedTerm = useDebounce(termRaw, 150);
  const debouncedTax = useDebounce(annualTaxRaw, 150);
  const debouncedIns = useDebounce(annualInsuranceRaw, 150);

  const parsed = useMemo(
    () =>
      parseInputs(
        debouncedLoan,
        debouncedRate,
        debouncedTerm,
        termUnit,
        debouncedTax,
        debouncedIns,
      ),
    [
      debouncedLoan,
      debouncedRate,
      debouncedTerm,
      termUnit,
      debouncedTax,
      debouncedIns,
    ],
  );
  const errors = useMemo(() => deriveErrors(parsed), [parsed]);
  const computed = useMemo(() => compute(parsed, termUnit), [parsed, termUnit]);

  const isEmpty = computed === null;

  // Chart shows the P&I balance over time; escrow doesn't reduce balance.
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
    ? `Loan balance over time. Starts at ${formatMoney(computed.loanAmount)} loan amount, decreases to zero at month ${computed.termMonths}.`
    : 'Loan balance chart. Enter inputs to populate.';

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── Persistent disclaimer banner (mandatory, always visible) ── */}
        <Banner
          tone="note"
          title="Estimate only"
          detail="Excludes HOA, closing costs, and PMI auto-drop logic. For shopping purposes only — your lender's quote is authoritative."
        />

        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Loan amount"
            value={loanAmountRaw}
            onChange={(e) => setLoanAmountRaw(e.target.value)}
            placeholder="300,000"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Loan amount"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.loanAmount ?? undefined}
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
          <div className="grid grid-cols-[1fr_120px] gap-2">
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
              label="Unit"
              value={termUnit}
              onChange={(e) => setTermUnit(e.target.value as TermUnit)}
              aria-label="Term unit"
              options={[
                { value: 'years', label: 'Years' },
                { value: 'months', label: 'Months' },
              ]}
            />
          </div>
          <Input
            label="Annual property tax (optional)"
            value={annualTaxRaw}
            onChange={(e) => setAnnualTaxRaw(e.target.value)}
            placeholder="4,800"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Annual property tax"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.annualTax ?? undefined}
          />
          <Input
            label="Annual insurance (optional)"
            value={annualInsuranceRaw}
            onChange={(e) => setAnnualInsuranceRaw(e.target.value)}
            placeholder="1,200"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Annual insurance"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.annualInsurance ?? undefined}
          />
        </div>

        {/* ─── Result block ───────────────────────────────────────────── */}
        <section
          aria-live="polite"
          className="flex flex-col gap-4 px-5 py-5"
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
                Total monthly payment
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Total monthly payment"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.totalMonthly)}
              </span>
            </div>
            <CopyButton
              value={computed?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          {/* Breakdown — P&I, tax, insurance, total */}
          <div
            className="flex flex-col gap-1.5 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span>Principal &amp; interest</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="P and I monthly amount"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.monthlyPayment)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Property tax / month</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Property tax monthly amount"
              >
                {isEmpty || computed.monthlyTax <= 0
                  ? EM_DASH
                  : formatMoney(computed.monthlyTax)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Insurance / month</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Insurance monthly amount"
              >
                {isEmpty || computed.monthlyInsurance <= 0
                  ? EM_DASH
                  : formatMoney(computed.monthlyInsurance)}
              </span>
            </div>
            <div
              className="mt-1 flex items-baseline justify-between gap-3 pt-2 text-sm font-semibold"
              style={{ borderTop: '1px solid var(--border-secondary)' }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Total</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(computed.totalMonthly)}
              </span>
            </div>
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

        {/* ─── Zero-rate banner (info, alongside the persistent note) ─── */}
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

export default Mortgage;
