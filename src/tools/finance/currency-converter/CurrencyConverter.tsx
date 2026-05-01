import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { loadFinanceDataset, type BundledDataState } from '@/lib/bundledData';
import { formatMoney, formatNumber } from '@/lib/format';
import { redactedError } from '@/lib/redactedError';
import { importFxSnapshot, resetFinanceOverlay } from '@/lib/tauri';
import { parseAndValidate } from '@/lib/validators';
import { useAppStore } from '@/stores/appStore';
import { meta } from './meta';

const EM_DASH = '—';
const H10_URL = 'https://www.federalreserve.gov/releases/h10/current/';
const LARGE_AMOUNT_THRESHOLD = 1000;

interface FxData {
  asOf: string;
  base: string;
  rates: Record<string, number>;
}

type FxState = BundledDataState<FxData>;

interface Conversion {
  amount: number;
  from: string;
  to: string;
  rate: number;
  result: number;
  copyText: string;
  showApproximate: boolean;
}

/**
 * Build the sorted list of currency codes that the dropdowns offer. The base
 * currency (USD) is always included even though `rates` only contains the
 * destinations.
 */
function buildCodes(data: FxData): string[] {
  const set = new Set<string>([data.base, ...Object.keys(data.rates)]);
  return Array.from(set).sort();
}

/**
 * Cross-rate via the snapshot's base. `rate(A→B) = rates[B] / rates[A]` and
 * the base's rate is implicitly `1`. Returns `null` for unsupported pairs so
 * the UI can render a friendly message instead of NaN.
 */
function crossRate(data: FxData, from: string, to: string): number | null {
  if (from === to) return 1;
  const rateOf = (code: string): number | null => {
    if (code === data.base) return 1;
    const v = data.rates[code];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  };
  const fromRate = rateOf(from);
  const toRate = rateOf(to);
  if (fromRate === null || toRate === null) return null;
  return toRate / fromRate;
}

function buildCopyText(c: Conversion, asOf: string): string {
  // Use plain numbers (no symbols / locale formatting) so the copy is parser-
  // friendly. Rate hint goes through formatNumber for the trailing detail.
  return `${c.amount} ${c.from} = ${c.result.toFixed(4)} ${c.to} (rates as of ${asOf})`;
}

function CurrencyConverter() {
  const showToast = useAppStore((s) => s.showToast);

  const [dataset, setDataset] = useState<FxState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);

  const [amountRaw, setAmountRaw] = useState('');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EUR');

  const [updateExpanded, setUpdateExpanded] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const debouncedAmount = useDebounce(amountRaw, 150);

  const reload = useCallback(async (): Promise<FxState | null> => {
    try {
      const next = await loadFinanceDataset<FxData>('fx-usd');
      setDataset(next);
      setLoadError(null);
      return next;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(redactedError(msg, 'Could not load currency rates'));
      setDataset(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDataset(true);
    void (async () => {
      const next = await reload();
      if (cancelled) return;
      // If the bundled snapshot doesn't contain the default "EUR" target
      // (theoretically possible if a user has imported a stripped overlay),
      // fall back to the first non-base code.
      if (next && !next.data.rates['EUR']) {
        const codes = buildCodes(next.data).filter((c) => c !== next.data.base);
        if (codes.length > 0) setTo(codes[0] ?? 'EUR');
      }
      setLoadingDataset(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const codes = useMemo(
    () => (dataset ? buildCodes(dataset.data) : []),
    [dataset],
  );

  const codeOptions = useMemo(
    () => codes.map((c) => ({ value: c, label: c })),
    [codes],
  );

  const amountParsed = useMemo(
    () =>
      parseAndValidate(debouncedAmount, {
        min: 0,
        max: 1e12,
        fieldLabel: 'Amount',
        optional: true,
      }),
    [debouncedAmount],
  );

  const amountError = amountParsed.ok ? null : amountParsed.error;

  const conversion: Conversion | null = useMemo(() => {
    if (!dataset) return null;
    if (!amountParsed.ok) return null;
    const amount = amountParsed.value;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const rate = crossRate(dataset.data, from, to);
    if (rate === null) return null;
    const result = amount * rate;
    const showApproximate =
      dataset.tone === 'red' && amount >= LARGE_AMOUNT_THRESHOLD;
    const partial: Conversion = {
      amount,
      from,
      to,
      rate,
      result,
      copyText: '',
      showApproximate,
    };
    partial.copyText = buildCopyText(partial, dataset.asOf);
    return partial;
  }, [amountParsed, dataset, from, to]);

  const isPairUnsupported = useMemo(() => {
    if (!dataset) return false;
    if (!amountParsed.ok) return false;
    const amount = amountParsed.value;
    if (!Number.isFinite(amount) || amount <= 0) return false;
    return crossRate(dataset.data, from, to) === null;
  }, [amountParsed, dataset, from, to]);

  const isEmpty = conversion === null;

  // ── Banner content per tone ────────────────────────────────────────────
  const bannerContent = useMemo(() => {
    if (!dataset) return null;
    const { tone, asOf, ageDays } = dataset;
    if (tone === 'fresh' || tone === 'static') {
      return {
        tone: 'info' as const,
        title: `Rates as of ${asOf}`,
        detail: 'USD base. Federal Reserve H.10.',
      };
    }
    if (tone === 'amber') {
      return {
        tone: 'warning' as const,
        title: `Rates from ${asOf}`,
        detail: `${ageDays} days old. Consider updating before large transfers.`,
      };
    }
    return {
      tone: 'danger' as const,
      title: `Rates from ${asOf}`,
      detail: 'Over 30 days old. Verify rates before transferring large sums.',
    };
  }, [dataset]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSwap = useCallback(() => {
    setFrom((prevFrom) => {
      setTo(prevFrom);
      return to;
    });
  }, [to]);

  const handleOpenSource = useCallback(() => {
    // Tauri webview routes `_blank` external links to the default browser.
    // No shell plugin is registered (per CLAUDE.md tauri capabilities) so
    // window.open is the only safe path. We don't catch a return value —
    // a blocked open silently no-ops, which is acceptable for a discoverable
    // affordance.
    if (typeof window !== 'undefined') {
      window.open(H10_URL, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleApplySnapshot = useCallback(async () => {
    if (pasteBusy) return;
    setPasteBusy(true);
    setPasteError(null);
    try {
      const trimmed = pasteText.trim();
      if (trimmed.length === 0) {
        setPasteError('Paste a JSON snapshot before applying.');
        return;
      }
      await importFxSnapshot(trimmed);
      const next = await reload();
      setPasteText('');
      if (next) {
        showToast(`Rates updated to ${next.asOf}`, 'success');
      } else {
        showToast('Rates updated', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPasteError(`Snapshot rejected: ${redactedError(msg, 'invalid snapshot')}`);
    } finally {
      setPasteBusy(false);
    }
  }, [pasteBusy, pasteText, reload, showToast]);

  const handleResetConfirm = useCallback(async () => {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      await resetFinanceOverlay('fx-usd');
      await reload();
      showToast('Reverted to bundled rates', 'success');
      setConfirmReset(false);
      setPasteError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(redactedError(msg, 'Could not reset to bundled rates'), 'error');
    } finally {
      setResetBusy(false);
    }
  }, [reload, resetBusy, showToast]);

  // ── Render: load failure ───────────────────────────────────────────────
  if (loadError) {
    return (
      <ToolPage tool={meta}>
        <div className="flex flex-col gap-4">
          <Banner
            tone="danger"
            title="Could not load currency rates"
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
  if (loadingDataset || !dataset || !bannerContent) {
    return (
      <ToolPage tool={meta}>
        <p
          className="py-8 text-center text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Loading rates…
        </p>
      </ToolPage>
    );
  }

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── As-of banner (always visible) ───────────────────────────── */}
        <Banner
          tone={bannerContent.tone}
          title={bannerContent.title}
          detail={bannerContent.detail}
          actionLabel="Refresh rates ↗"
          onAction={handleOpenSource}
        />

        {/* ─── Conversion row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_32px_110px] sm:items-end">
          <Input
            label="Amount"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Amount"
            className="text-right text-lg tabular-nums"
            error={amountError ?? undefined}
          />
          <Select
            label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From currency"
            options={codeOptions}
          />
          <div className="flex items-center justify-center pb-px sm:pb-1">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap currencies"
              className="inline-flex h-9 w-9 items-center justify-center transition-colors duration-150"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
              }}
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Select
            label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To currency"
            options={codeOptions}
          />
        </div>

        {/* ─── Result block ────────────────────────────────────────────── */}
        <section
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 px-5 py-5"
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
                Converted amount
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Converted amount"
              >
                {isEmpty ? EM_DASH : formatMoney(conversion.result, to)}
              </span>
            </div>
            <CopyButton
              value={conversion?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          {!isEmpty && (
            <div
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs tabular-nums"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>
                1 {from} ={' '}
                {formatNumber(conversion.rate, {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}{' '}
                {to}
              </span>
              <span aria-hidden="true">·</span>
              <span>as of {dataset.asOf}</span>
              {conversion.showApproximate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: 'var(--warning)' }}>
                    approximate — verify before transferring
                  </span>
                </>
              )}
            </div>
          )}

          {isPairUnsupported && (
            <p
              className="text-xs"
              style={{ color: 'var(--danger)' }}
              role="alert"
            >
              Pair not supported by current snapshot. Try refreshing rates or
              pick another currency.
            </p>
          )}
        </section>

        {/* ─── Update rates section (collapsible) ──────────────────────── */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setUpdateExpanded((v) => !v)}
            aria-expanded={updateExpanded}
            aria-controls="currency-update-panel"
            className="self-start text-sm font-medium transition-colors duration-150"
            style={{ color: 'var(--text-secondary)' }}
          >
            {updateExpanded ? '▾' : '▸'} Update rates manually
          </button>

          {updateExpanded && (
            <div
              id="currency-update-panel"
              className="flex flex-col gap-3 px-4 py-4"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p
                id="currency-update-help"
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Click <span className="font-medium">Refresh rates</span> above
                to open the Federal Reserve source. Copy the latest H.10
                release as JSON, then paste below.
              </p>
              <Textarea
                aria-label="Snapshot JSON"
                aria-describedby="currency-update-help"
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  if (pasteError) setPasteError(null);
                }}
                placeholder={`{"asOf":"YYYY-MM-DD","base":"USD","rates":{"EUR":0.92,"GBP":0.79,...}}`}
                monospace
                rows={4}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                error={pasteError ?? undefined}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplySnapshot}
                  loading={pasteBusy}
                  disabled={pasteBusy}
                >
                  {pasteBusy ? 'Validating…' : 'Validate & apply'}
                </Button>
                {dataset.source === 'overlay' && !confirmReset && (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="text-xs underline-offset-2 hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Reset to bundled
                  </button>
                )}
                {dataset.source === 'overlay' && confirmReset && (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Discard imported rates?
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleResetConfirm}
                      loading={resetBusy}
                      disabled={resetBusy}
                    >
                      Confirm reset
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All conversions run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default CurrencyConverter;
