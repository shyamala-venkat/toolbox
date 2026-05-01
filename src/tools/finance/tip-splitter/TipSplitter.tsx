import { useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { parseAndValidate, type ValidationResult } from '@/lib/validators';
import { formatMoney } from '@/lib/format';
import { meta } from './meta';

const EM_DASH = '—';
const DEFAULT_TIP = '18';
const DEFAULT_PARTY = '2';

interface ComputedResult {
  perPerson: number;
  totalWithTip: number;
  tipAmount: number;
  copyText: string;
}

interface FieldErrors {
  bill: string | null;
  tip: string | null;
  party: string | null;
}

interface ParseOutcome {
  bill: ValidationResult<number>;
  tip: ValidationResult<number>;
  party: ValidationResult<number>;
}

function parseInputs(
  bill: string,
  tip: string,
  party: string,
): ParseOutcome {
  return {
    // Bill is the only "required" input — empty bill = empty state, not error.
    bill: parseAndValidate(bill, {
      min: 0,
      max: 1e9,
      fieldLabel: 'Bill',
      optional: true,
    }),
    tip: parseAndValidate(tip, {
      min: 0,
      max: 100,
      fieldLabel: 'Tip',
    }),
    party: parseAndValidate(party, {
      min: 1,
      max: 999,
      integer: true,
      fieldLabel: 'Party size',
    }),
  };
}

function buildCopyText(
  perPerson: number,
  totalWithTip: number,
  bill: number,
  tipPct: number,
  party: number,
): string {
  return (
    `Per person: ${formatMoney(perPerson)} ` +
    `(bill ${formatMoney(bill)} + tip ${tipPct}%, split ${party} ${party === 1 ? 'way' : 'ways'}) ` +
    `· total ${formatMoney(totalWithTip)}`
  );
}

function compute(parsed: ParseOutcome): ComputedResult | null {
  if (!parsed.bill.ok || !parsed.tip.ok || !parsed.party.ok) return null;
  const bill = parsed.bill.value;
  const tipPct = parsed.tip.value;
  const party = parsed.party.value;

  // Bill empty (NaN from optional) → no result.
  if (!Number.isFinite(bill) || bill <= 0) return null;
  if (party <= 0) return null;

  const tipAmount = bill * (tipPct / 100);
  const totalWithTip = bill + tipAmount;
  const perPerson = totalWithTip / party;

  return {
    perPerson,
    totalWithTip,
    tipAmount,
    copyText: buildCopyText(perPerson, totalWithTip, bill, tipPct, party),
  };
}

function deriveErrors(parsed: ParseOutcome): FieldErrors {
  // The bill field is optional at the parse layer — an empty bill returns
  // `{ ok: true, value: NaN }`, not a parse failure — so any !ok here is
  // a genuine malformed-input error worth surfacing inline.
  return {
    bill: parsed.bill.ok ? null : parsed.bill.error,
    tip: parsed.tip.ok ? null : parsed.tip.error,
    party: parsed.party.ok ? null : parsed.party.error,
  };
}

function TipSplitter() {
  const [billRaw, setBillRaw] = useState('');
  const [tipRaw, setTipRaw] = useState(DEFAULT_TIP);
  const [partyRaw, setPartyRaw] = useState(DEFAULT_PARTY);

  const debouncedBill = useDebounce(billRaw, 150);
  const debouncedTip = useDebounce(tipRaw, 150);
  const debouncedParty = useDebounce(partyRaw, 150);

  const parsed = useMemo(
    () => parseInputs(debouncedBill, debouncedTip, debouncedParty),
    [debouncedBill, debouncedTip, debouncedParty],
  );

  const result = useMemo(() => compute(parsed), [parsed]);
  const errors = useMemo(() => deriveErrors(parsed), [parsed]);

  const isEmpty = result === null;

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── Inputs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Bill amount"
            value={billRaw}
            onChange={(e) => setBillRaw(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Bill amount"
            leadingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                $
              </span>
            }
            error={errors.bill ?? undefined}
          />
          <Input
            label="Tip"
            value={tipRaw}
            onChange={(e) => setTipRaw(e.target.value)}
            placeholder="18"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label="Tip percentage"
            trailingIcon={
              <span
                className="text-sm"
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden="true"
              >
                %
              </span>
            }
            error={errors.tip ?? undefined}
          />
          <Input
            label="Party size"
            value={partyRaw}
            onChange={(e) => setPartyRaw(e.target.value)}
            placeholder="2"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Party size"
            error={errors.party ?? undefined}
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
                Per person
              </span>
              <span
                className="text-3xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Per person amount"
              >
                {isEmpty ? EM_DASH : formatMoney(result.perPerson)}
              </span>
            </div>
            <CopyButton
              value={result?.copyText ?? ''}
              disabled={isEmpty}
              label="Copy"
            />
          </div>

          <div
            className="flex flex-wrap gap-x-6 gap-y-1 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>
              Total with tip:{' '}
              <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {isEmpty ? EM_DASH : formatMoney(result.totalWithTip)}
              </span>
            </span>
            <span>
              Tip amount:{' '}
              <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {isEmpty ? EM_DASH : formatMoney(result.tipAmount)}
              </span>
            </span>
          </div>
        </section>

        {/* ─── Footer ─────────────────────────────────────────────────── */}
        <p
          className="text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          All calculations run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default TipSplitter;
