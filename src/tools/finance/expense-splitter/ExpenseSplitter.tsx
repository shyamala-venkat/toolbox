import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { formatMoney } from '@/lib/format';
import { parseAndValidate } from '@/lib/validators';
import {
  splitExpenses,
  type SplitResult,
} from '../_lib/finance-math';
import { meta } from './meta';

const MAX_PEOPLE = 50;
const SETTLED_TOL = 0.01;

interface PersonRow {
  id: string;
  name: string;
}

interface ExpenseRow {
  id: string;
  payerId: string;
  amountText: string;
  note: string;
}

interface ParsedExpense {
  index: number;
  payerName: string;
  amount: number;
  note: string;
}

interface ComputedView {
  result: SplitResult;
  /** Display-only people array — duplicate names are disambiguated. */
  displayNames: string[];
  isBalanced: boolean;
  copyText: string;
}

interface PreparedInputs {
  /** People list with display names assigned (duplicates → "Alex (2)"). */
  displayNames: string[];
  /** Map of person id → display name. */
  idToDisplay: Map<string, string>;
  /** Validated expenses ready for `splitExpenses`. */
  parsedExpenses: ParsedExpense[];
  /** Per-row error message (null when valid). */
  rowErrors: Map<string, string | null>;
}

function newId(): string {
  // crypto.randomUUID is available in Tauri's webview and modern browsers.
  // Fallback uses crypto.getRandomValues — never the unsafe pseudo-RNG.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function makeInitialPeople(): PersonRow[] {
  return [
    { id: newId(), name: '' },
    { id: newId(), name: '' },
  ];
}

/**
 * Build display names from raw rows.
 *
 * Empty names render as a placeholder ("Anonymous person 1", etc.) and
 * duplicates get a numeric suffix ("Alex (2)") so the settlement output
 * never confuses two real people who share a first name.
 */
function buildDisplayNames(people: PersonRow[]): {
  displayNames: string[];
  idToDisplay: Map<string, string>;
} {
  const trimmed = people.map((p) => p.name.trim());
  const counts = new Map<string, number>();
  const seenSoFar = new Map<string, number>();

  // First pass — count occurrences of each non-empty trimmed name.
  for (const name of trimmed) {
    if (name.length > 0) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  let anonIndex = 0;
  const displayNames: string[] = [];
  const idToDisplay = new Map<string, string>();

  for (let i = 0; i < people.length; i += 1) {
    const row = people[i];
    if (!row) continue;
    const raw = trimmed[i] ?? '';
    let display: string;
    if (raw.length === 0) {
      anonIndex += 1;
      display = `Anonymous person ${anonIndex}`;
    } else if ((counts.get(raw) ?? 0) > 1) {
      const ordinal = (seenSoFar.get(raw) ?? 0) + 1;
      seenSoFar.set(raw, ordinal);
      // First occurrence keeps the bare name; subsequent ones get "(2)", "(3)"…
      display = ordinal === 1 ? raw : `${raw} (${ordinal})`;
    } else {
      display = raw;
    }
    displayNames.push(display);
    idToDisplay.set(row.id, display);
  }

  return { displayNames, idToDisplay };
}

function prepareInputs(
  people: PersonRow[],
  expenses: ExpenseRow[],
): PreparedInputs {
  const { displayNames, idToDisplay } = buildDisplayNames(people);
  const rowErrors = new Map<string, string | null>();
  const parsedExpenses: ParsedExpense[] = [];

  for (let i = 0; i < expenses.length; i += 1) {
    const row = expenses[i];
    if (!row) continue;
    const payerName = idToDisplay.get(row.payerId);
    if (!payerName) {
      // Payer was deleted from the people list. Treat as invalid — don't
      // crash, don't echo a financial number in the message.
      rowErrors.set(row.id, 'Payer is no longer in the people list');
      continue;
    }
    const parsed = parseAndValidate(row.amountText, {
      min: 0,
      max: 1e9,
      fieldLabel: 'Amount',
      optional: true,
    });
    if (!parsed.ok) {
      rowErrors.set(row.id, parsed.error);
      continue;
    }
    if (!Number.isFinite(parsed.value)) {
      // Empty input → not an error, just skip this row from the calc.
      rowErrors.set(row.id, null);
      continue;
    }
    rowErrors.set(row.id, null);
    parsedExpenses.push({
      index: i,
      payerName,
      amount: parsed.value,
      note: row.note.trim(),
    });
  }

  return { displayNames, idToDisplay, parsedExpenses, rowErrors };
}

function buildCopyText(
  result: SplitResult,
  displayNames: string[],
): string {
  const header = `Settlement for ${formatMoney(result.total)} across ${displayNames.length} ${displayNames.length === 1 ? 'person' : 'people'}:`;
  const paidLines = result.perPerson.map(
    (p) => `- ${p.name} paid ${formatMoney(p.paid)} (share ${formatMoney(p.share)})`,
  );
  const lines = [header, ...paidLines];
  if (result.settlements.length > 0) {
    lines.push('');
    lines.push('Settlements:');
    for (const s of result.settlements) {
      lines.push(`- ${s.from} → ${s.to}: ${formatMoney(s.amount)}`);
    }
  } else {
    lines.push('');
    lines.push('Settlements: everyone is even.');
  }
  return lines.join('\n');
}

function compute(prepared: PreparedInputs): ComputedView | null {
  if (prepared.displayNames.length === 0) return null;
  if (prepared.parsedExpenses.length === 0) return null;

  let result: SplitResult;
  try {
    result = splitExpenses(
      prepared.displayNames,
      prepared.parsedExpenses.map((p) => ({
        payer: p.payerName,
        amount: p.amount,
        note: p.note.length > 0 ? p.note : undefined,
      })),
    );
  } catch {
    return null;
  }

  const isBalanced = result.perPerson.every(
    (p) => Math.abs(p.net) <= SETTLED_TOL,
  );
  return {
    result,
    displayNames: prepared.displayNames,
    isBalanced,
    copyText: buildCopyText(result, prepared.displayNames),
  };
}

function netColorVar(net: number): string {
  if (net > SETTLED_TOL) return 'var(--success)';
  if (net < -SETTLED_TOL) return 'var(--danger)';
  return 'var(--text-secondary)';
}

function ExpenseSplitter() {
  const [people, setPeople] = useState<PersonRow[]>(makeInitialPeople);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const debouncedPeople = useDebounce(people, 150);
  const debouncedExpenses = useDebounce(expenses, 150);

  const prepared = useMemo(
    () => prepareInputs(debouncedPeople, debouncedExpenses),
    [debouncedPeople, debouncedExpenses],
  );

  const computed = useMemo(() => compute(prepared), [prepared]);

  // ─── People handlers ─────────────────────────────────────────────────────
  const updatePersonName = (id: string, name: string): void => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const addPerson = (): void => {
    setPeople((prev) => {
      if (prev.length >= MAX_PEOPLE) return prev;
      return [...prev, { id: newId(), name: '' }];
    });
  };

  const removePerson = (id: string): void => {
    setPeople((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p.id !== id);
    });
    // Don't auto-delete expenses tied to this person — let the row error
    // surface ("Payer is no longer in the people list") so the user notices.
  };

  // ─── Expense handlers ────────────────────────────────────────────────────
  const updateExpenseField = (
    id: string,
    field: 'payerId' | 'amountText' | 'note',
    value: string,
  ): void => {
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };

  const addExpense = (): void => {
    if (people.length === 0) return;
    const firstPerson = people[0];
    if (!firstPerson) return;
    setExpenses((prev) => [
      ...prev,
      {
        id: newId(),
        payerId: firstPerson.id,
        amountText: '',
        note: '',
      },
    ]);
  };

  const removeExpense = (id: string): void => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const peopleEmpty = people.length === 0;
  const peopleAtMax = people.length >= MAX_PEOPLE;

  const peopleOptions = useMemo(
    () =>
      people.map((p, i) => {
        const display = prepared.idToDisplay.get(p.id) ?? `Person ${i + 1}`;
        return { value: p.id, label: display };
      }),
    [people, prepared.idToDisplay],
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* ─── People list ──────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3" aria-label="People">
          <div className="flex items-baseline justify-between">
            <h2
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-tertiary)' }}
            >
              People
            </h2>
            <span
              className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {people.length} / {MAX_PEOPLE}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {people.map((p, i) => {
              const placeholder = `Person ${i + 1}`;
              const isOnly = people.length <= 1;
              const removeLabel = p.name.trim().length > 0
                ? `Remove ${p.name.trim()}`
                : `Remove person ${i + 1}`;
              return (
                <li key={p.id} className="flex items-start gap-2">
                  <Input
                    value={p.name}
                    onChange={(e) => updatePersonName(p.id, e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Person name"
                  />
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => removePerson(p.id)}
                    disabled={isOnly}
                    aria-label={removeLabel}
                    title={isOnly ? 'At least one person is required' : 'Remove'}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={addPerson}
              disabled={peopleAtMax}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Add person
            </Button>
            {peopleAtMax && (
              <span
                className="ml-3 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Max {MAX_PEOPLE} people
              </span>
            )}
          </div>
        </section>

        {/* ─── Expenses list ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3" aria-label="Expenses">
          <h2
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Expenses
          </h2>
          {peopleEmpty ? (
            <p
              className="text-sm"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Add at least one person to start tracking expenses.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {expenses.map((row) => {
                  const error = prepared.rowErrors.get(row.id) ?? null;
                  return (
                    <li
                      key={row.id}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_1.2fr_auto] sm:items-start"
                    >
                      <Select
                        value={row.payerId}
                        onChange={(e) =>
                          updateExpenseField(row.id, 'payerId', e.target.value)
                        }
                        options={peopleOptions}
                        aria-label="Expense payer"
                      />
                      <Input
                        value={row.amountText}
                        onChange={(e) =>
                          updateExpenseField(row.id, 'amountText', e.target.value)
                        }
                        placeholder="0.00"
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Expense amount"
                        leadingIcon={
                          <span
                            className="text-sm"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-hidden="true"
                          >
                            $
                          </span>
                        }
                        error={error ?? undefined}
                      />
                      <Input
                        value={row.note}
                        onChange={(e) =>
                          updateExpenseField(row.id, 'note', e.target.value)
                        }
                        placeholder="Note (optional)"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Expense note"
                      />
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => removeExpense(row.id)}
                        aria-label="Remove expense"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={addExpense}
                  leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  Add expense
                </Button>
              </div>
            </>
          )}
        </section>

        {/* ─── Result block ─────────────────────────────────────────────── */}
        <section
          aria-live="polite"
          className="flex flex-col gap-4 px-5 py-5"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {computed === null ? (
            <p
              className="text-center text-sm"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Add expenses to see settlement
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Total
                  </span>
                  <span
                    className="text-3xl font-semibold leading-none tabular-nums"
                    style={{ color: 'var(--text-primary)' }}
                    aria-label="Total amount"
                  >
                    {formatMoney(computed.result.total)}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    across {computed.displayNames.length}{' '}
                    {computed.displayNames.length === 1 ? 'person' : 'people'}
                    {' · '}
                    {formatMoney(
                      computed.result.total / computed.displayNames.length,
                    )}{' '}
                    per person
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {computed.isBalanced && (
                    <span
                      role="status"
                      aria-live="polite"
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                      }}
                    >
                      Settled
                    </span>
                  )}
                  <CopyButton value={computed.copyText} label="Copy" />
                </div>
              </div>

              {/* Per-person breakdown */}
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs tabular-nums"
                  aria-label="Per-person totals"
                >
                  <thead
                    style={{
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-left font-medium">
                        Person
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        Paid
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        Share
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--text-primary)' }}>
                    {computed.result.perPerson.map((p) => (
                      <tr
                        key={p.name}
                        style={{ borderTop: '1px solid var(--border-secondary)' }}
                      >
                        <td className="px-2 py-1.5 text-left">{p.name}</td>
                        <td className="px-2 py-1.5 text-right">
                          {formatMoney(p.paid)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {formatMoney(p.share)}
                        </td>
                        <td
                          className="px-2 py-1.5 text-right font-medium"
                          style={{ color: netColorVar(p.net) }}
                        >
                          {p.net > SETTLED_TOL ? '+' : ''}
                          {formatMoney(p.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Settlements list */}
              {computed.result.settlements.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <span
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Settlements
                  </span>
                  <ul
                    className="flex flex-col gap-1 text-sm tabular-nums"
                    aria-label="Settlements"
                  >
                    {computed.result.settlements.map((s, idx) => (
                      <li
                        key={`${s.from}-${s.to}-${idx}`}
                        className="flex items-baseline gap-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {s.from}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {s.to}
                        </span>
                        <span
                          className="ml-auto font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {formatMoney(s.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                !computed.isBalanced && (
                  <p
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    No settlements needed.
                  </p>
                )
              )}
            </>
          )}
        </section>

        {/* ─── Footer ───────────────────────────────────────────────────── */}
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          All calculations run locally. No data leaves your machine.
        </p>
      </div>
    </ToolPage>
  );
}

export default ExpenseSplitter;
