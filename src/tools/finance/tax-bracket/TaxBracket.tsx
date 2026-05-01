import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Banner } from '@/components/ui/Banner';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { loadFinanceDataset, type BundledDataState } from '@/lib/bundledData';
import { formatMoney, formatPercent } from '@/lib/format';
import { redactedError } from '@/lib/redactedError';
import { parseAndValidate } from '@/lib/validators';
import {
  taxOwed,
  type FilingStatus,
  type TaxBracket as TaxBracketRange,
} from '../_lib/finance-math';
import { meta } from './meta';

const EM_DASH = '—';
const YEAR_PLACEHOLDER = 'TY—';

interface FilingStatusEntry {
  standardDeduction: number;
  brackets: TaxBracketRange[];
}

interface TaxFedData {
  taxYear: number;
  currency: string;
  filingStatuses: Record<FilingStatus, FilingStatusEntry>;
}

type TaxState = BundledDataState<TaxFedData>;

const FILING_OPTIONS: ReadonlyArray<{ value: FilingStatus; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'marriedJointly', label: 'Married Filing Jointly' },
  { value: 'marriedSeparate', label: 'Married Filing Separately' },
  { value: 'headOfHousehold', label: 'Head of Household' },
];

function statusLabel(status: FilingStatus): string {
  return FILING_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/** Compute the lower bound of a bracket given the previous bracket's `upTo`. */
function lowerBound(prevUpTo: number | null): number {
  return prevUpTo === null ? 0 : prevUpTo;
}

/** Tax paid in this bracket given a taxable income, the bracket's range, and rate. */
function taxInBracket(
  taxableIncome: number,
  lower: number,
  upper: number | null,
  rate: number,
): number {
  if (taxableIncome <= lower) return 0;
  const cap = upper === null ? taxableIncome : Math.min(taxableIncome, upper);
  return Math.max(0, cap - lower) * rate;
}

interface ComputedTax {
  taxOwed: number;
  marginalRate: number;
  effectiveRate: number;
  taxableIncome: number;
  standardDeduction: number;
  brackets: TaxBracketRange[];
  copyText: string;
}

function TaxBracket() {
  const [dataset, setDataset] = useState<TaxState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);

  const [incomeRaw, setIncomeRaw] = useState('');
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');

  const debouncedIncome = useDebounce(incomeRaw, 150);

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

  const incomeParsed = useMemo(
    () =>
      parseAndValidate(debouncedIncome, {
        min: 0,
        max: 1e9,
        fieldLabel: 'Gross income',
        optional: true,
      }),
    [debouncedIncome],
  );

  const incomeError = incomeParsed.ok ? null : incomeParsed.error;

  const computed: ComputedTax | null = useMemo(() => {
    if (!dataset) return null;
    if (!incomeParsed.ok) return null;
    const gross = incomeParsed.value;
    if (!Number.isFinite(gross) || gross <= 0) return null;

    const entry = dataset.data.filingStatuses[filingStatus];
    if (!entry) return null;
    const taxableIncome = Math.max(0, gross - entry.standardDeduction);

    let result;
    try {
      result = taxOwed(taxableIncome, entry.brackets);
    } catch {
      return null;
    }

    // Effective rate is presented relative to GROSS income (the user-facing
    // number people quote), not taxable income. Avoid div-by-zero when gross
    // is non-positive (already guarded above, but defensive).
    const effectiveRate = gross > 0 ? result.taxOwed / gross : 0;

    const copyText =
      `Federal tax estimate (${yearLabel}, ${statusLabel(filingStatus)}): ` +
      `${formatMoney(result.taxOwed)} on ${formatMoney(gross)} gross income — ` +
      `effective ${(effectiveRate * 100).toFixed(2)}%, ` +
      `marginal ${(result.marginalRate * 100).toFixed(2)}% ` +
      `(estimate only, not tax advice).`;

    return {
      taxOwed: result.taxOwed,
      marginalRate: result.marginalRate,
      effectiveRate,
      taxableIncome,
      standardDeduction: entry.standardDeduction,
      brackets: entry.brackets,
      copyText,
    };
  }, [dataset, incomeParsed, filingStatus, yearLabel]);

  const isEmpty = computed === null;

  // ── Persistent disclaimer banner (always visible in every state) ──────
  const disclaimerBanner = (
    <Banner
      tone="note"
      title={dataset ? `Estimate only — Tax Year ${dataset.data.taxYear}` : 'Estimate only — Tax Year (loading)'}
      detail="Not tax advice. Federal only, W-2 wages with standard deduction. Consult a CPA for your situation."
    />
  );

  // ── Render: load failure ───────────────────────────────────────────────
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

  // ── Render: initial loading ────────────────────────────────────────────
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Gross annual income"
            value={incomeRaw}
            onChange={(e) => setIncomeRaw(e.target.value)}
            placeholder="75,000"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Gross annual income"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={incomeError ?? undefined}
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
                Estimated federal tax
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Estimated federal tax"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.taxOwed)}
              </span>
            </div>
            <CopyButton
              value={computed?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          <div
            className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex flex-col gap-0.5">
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Taxable income
              </span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Taxable income"
              >
                {isEmpty ? EM_DASH : formatMoney(computed.taxableIncome)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Effective rate
              </span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Effective rate"
              >
                {isEmpty ? EM_DASH : formatPercent(computed.effectiveRate * 100, 2)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Marginal rate
              </span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Marginal rate"
              >
                {isEmpty ? EM_DASH : formatPercent(computed.marginalRate * 100, 2)}
              </span>
            </div>
          </div>

          {!isEmpty && computed.standardDeduction > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Standard deduction applied: {formatMoney(computed.standardDeduction)}.
            </p>
          )}
        </section>

        {/* ─── Bracket breakdown table ────────────────────────────────── */}
        {!isEmpty && (
          <div
            className="overflow-auto"
            style={{
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <table
              className="w-full text-xs tabular-nums"
              aria-label="Tax bracket breakdown"
            >
              <thead
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                }}
              >
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left font-medium"
                  >
                    Bracket range
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                  >
                    Rate
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                  >
                    Tax in this bracket
                  </th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-primary)' }}>
                {computed.brackets.map((b, idx) => {
                  const prev = idx === 0 ? null : computed.brackets[idx - 1];
                  const lower = lowerBound(prev?.upTo ?? null);
                  const upper = b.upTo;
                  const tax = taxInBracket(
                    computed.taxableIncome,
                    lower,
                    upper,
                    b.rate,
                  );
                  const rangeLabel =
                    upper === null
                      ? `${formatMoney(lower)}+`
                      : `${formatMoney(lower)} – ${formatMoney(upper)}`;
                  return (
                    <tr
                      key={idx}
                      style={{
                        borderTop: '1px solid var(--border-secondary)',
                      }}
                    >
                      <td className="px-3 py-1.5">{rangeLabel}</td>
                      <td className="px-3 py-1.5 text-right">
                        {formatPercent(b.rate * 100, 0)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {tax > 0 ? formatMoney(tax) : EM_DASH}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All calculations run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default TaxBracket;
