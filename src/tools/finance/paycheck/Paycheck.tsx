import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Banner } from '@/components/ui/Banner';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { loadFinanceDataset, type BundledDataState } from '@/lib/bundledData';
import { formatMoney } from '@/lib/format';
import { redactedError } from '@/lib/redactedError';
import { parseAndValidate } from '@/lib/validators';
import {
  paycheck,
  type FilingStatus,
  type PayPeriod,
  type PaycheckResult,
} from '../_lib/finance-math';
import { meta } from './meta';

const EM_DASH = '—';
const YEAR_PLACEHOLDER = 'TY—';

/**
 * The bundled tax-fed snapshot is JSON; we don't introspect it here — the
 * `paycheck()` math accepts the raw object and validates the fields it needs
 * via `asTaxFedShape`. We only need to surface the displayed tax year.
 */
interface TaxFedData {
  taxYear: number;
}

type TaxState = BundledDataState<TaxFedData>;

const FILING_OPTIONS: ReadonlyArray<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'marriedJointly', label: 'Married Filing Jointly' },
  { value: 'marriedSeparate', label: 'Married Filing Separately' },
  { value: 'headOfHousehold', label: 'Head of Household' },
];

const PERIOD_OPTIONS: ReadonlyArray<{ value: PayPeriod; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'semimonthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
];

function statusLabel(status: FilingStatus): string {
  return FILING_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function periodLabel(period: PayPeriod): string {
  return PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;
}

interface ComputedPaycheck {
  result: PaycheckResult;
  copyText: string;
}

function Paycheck() {
  const [dataset, setDataset] = useState<TaxState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);

  const [grossRaw, setGrossRaw] = useState('');
  const [period, setPeriod] = useState<PayPeriod>('annual');
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');

  const debouncedGross = useDebounce(grossRaw, 150);

  const reload = useCallback(async (): Promise<TaxState | null> => {
    try {
      const next = await loadFinanceDataset<TaxFedData>('tax-fed');
      setDataset(next);
      setLoadError(null);
      return next;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(redactedError(msg, 'Could not load tax tables'));
      setDataset(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDataset(true);
    void (async () => {
      await reload();
      if (cancelled) return;
      setLoadingDataset(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const yearLabel = useMemo(() => {
    if (!dataset) return YEAR_PLACEHOLDER;
    return `TY${dataset.data.taxYear}`;
  }, [dataset]);

  const grossParsed = useMemo(
    () =>
      parseAndValidate(debouncedGross, {
        min: 0,
        max: 1e8,
        fieldLabel: 'Gross pay',
        optional: true,
      }),
    [debouncedGross],
  );

  const grossError = grossParsed.ok ? null : grossParsed.error;

  const computed: ComputedPaycheck | null = useMemo(() => {
    if (!dataset) return null;
    if (!grossParsed.ok) return null;
    const gross = grossParsed.value;
    if (!Number.isFinite(gross) || gross <= 0) return null;

    let result: PaycheckResult;
    try {
      result = paycheck(
        {
          grossPerPeriod: gross,
          period,
          filingStatus,
          ytdWages: 0,
        },
        dataset.data,
      );
    } catch {
      return null;
    }

    const addlPart =
      result.additionalMedicare > 0
        ? ` add'l Medicare ${formatMoney(result.additionalMedicare)}`
        : '';

    const copyText =
      `Net pay (${yearLabel}, ${periodLabel(period)}, ${statusLabel(filingStatus)}): ` +
      `${formatMoney(result.netPay)} on ${formatMoney(gross)} gross — ` +
      `fed tax ${formatMoney(result.federalIncomeTax)}, ` +
      `SS ${formatMoney(result.socialSecurity)}, ` +
      `Medicare ${formatMoney(result.medicare)}${addlPart} ` +
      `(estimate only).`;

    return { result, copyText };
  }, [dataset, grossParsed, period, filingStatus, yearLabel]);

  const isEmpty = computed === null;

  // Derived annual figures for the comparison line. Use the result's
  // `annualGross` so we don't repeat the period multiplication client-side.
  const annualNet = useMemo(() => {
    if (!computed) return null;
    const periods = computed.result.annualGross / computed.result.grossPerPeriod;
    return computed.result.netPay * periods;
  }, [computed]);

  const disclaimerBanner = (
    <Banner
      tone="note"
      title={dataset ? `Estimate only — Tax Year ${dataset.data.taxYear}` : 'Estimate only — Tax Year (loading)'}
      detail="Federal income tax + FICA only. Excludes state, local, SUI/SDI, pre-tax benefits, and post-tax garnishments. Verify with your employer's payroll system."
    />
  );

  if (loadError) {
    return (
      <ToolPage tool={meta}>
        <div className="flex flex-col gap-4">
          {disclaimerBanner}
          <Banner
            tone="danger"
            title="Could not load tax tables"
            detail={loadError}
            actionLabel="Retry"
            onAction={() => {
              setLoadingDataset(true);
              void reload().finally(() => setLoadingDataset(false));
            }}
          />
        </div>
      </ToolPage>
    );
  }

  if (loadingDataset || !dataset) {
    return (
      <ToolPage tool={meta}>
        <div className="flex flex-col gap-4">
          {disclaimerBanner}
          <p
            className="py-8 text-center text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Loading tax tables…
          </p>
        </div>
      </ToolPage>
    );
  }

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {disclaimerBanner}

        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Gross pay per period"
            value={grossRaw}
            onChange={(e) => setGrossRaw(e.target.value)}
            placeholder="80,000"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Gross pay per period"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={grossError ?? undefined}
          />
          <Select
            label="Pay period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PayPeriod)}
            aria-label="Pay period"
            options={PERIOD_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <Select
            label="Filing status"
            value={filingStatus}
            onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
            aria-label="Filing status"
            options={FILING_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
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
                Net pay per period
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Net pay per period"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.netPay)}
              </span>
            </div>
            <CopyButton
              value={computed?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          <div
            className="flex flex-col gap-1.5 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span>Gross pay</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Gross pay amount"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.grossPerPeriod)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Federal income tax</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Federal income tax amount"
              >
                {isEmpty
                  ? EM_DASH
                  : `−${formatMoney(computed.result.federalIncomeTax)}`}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Social Security (6.2%)</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Social Security amount"
              >
                {isEmpty
                  ? EM_DASH
                  : `−${formatMoney(computed.result.socialSecurity)}`}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Medicare (1.45%)</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Medicare amount"
              >
                {isEmpty
                  ? EM_DASH
                  : `−${formatMoney(computed.result.medicare)}`}
              </span>
            </div>
            {!isEmpty && computed.result.additionalMedicare > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <span>Additional Medicare (0.9%)</span>
                <span
                  className="tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                  aria-label="Additional Medicare amount"
                >
                  −{formatMoney(computed.result.additionalMedicare)}
                </span>
              </div>
            )}
            <div
              className="mt-1 flex items-baseline justify-between gap-3 pt-2 text-sm font-semibold"
              style={{ borderTop: '1px solid var(--border-secondary)' }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Net pay</span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEmpty ? EM_DASH : formatMoney(computed.result.netPay)}
              </span>
            </div>
          </div>

          {!isEmpty && annualNet !== null && period !== 'annual' && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Annual: {formatMoney(computed.result.annualGross)} gross /{' '}
              {formatMoney(annualNet)} net
            </p>
          )}
        </section>

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All calculations run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default Paycheck;
