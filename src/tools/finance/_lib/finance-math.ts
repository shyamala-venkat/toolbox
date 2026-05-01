/**
 * Pure finance math used by the calculator-tier finance pack.
 *
 * Inputs are assumed to have been pre-validated by `parseAndValidate`.
 * Functions are defensive about non-finite inputs because the renderer
 * could call them mid-keystroke (e.g. NaN from optional fields), and we
 * throw a clear error rather than silently returning bogus numbers.
 */

// ─── Amortization (EMI / Mortgage) ──────────────────────────────────────────

export interface AmortizationRow {
  period: number;
  /** Principal portion of this period's payment. */
  principal: number;
  /** Interest portion of this period's payment. */
  interest: number;
  /** Remaining principal after this period's payment. */
  balance: number;
}

export interface AmortizationResult {
  /** Constant monthly payment (rate=0 → straight-line). */
  monthlyPayment: number;
  /** Sum of all interest portions. */
  totalInterest: number;
  schedule: AmortizationRow[];
}

function requireFinite(name: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new Error(`${name}: non-finite input`);
    }
  }
}

/**
 * Standard fixed-rate amortization. `annualRate` is a decimal (0.0625 for
 * 6.25%). When `annualRate === 0`, payments are straight-line: principal
 * divided evenly across `termMonths` with zero interest.
 *
 * `termMonths` must be a positive integer ≥ 1. The schedule contains exactly
 * `termMonths` rows; the final balance is rounded to zero (within a sub-cent
 * tolerance) so summed-principal equals the original principal.
 */
export function amortize(
  principal: number,
  annualRate: number,
  termMonths: number,
): AmortizationResult {
  requireFinite('amortize', principal, annualRate, termMonths);
  if (termMonths < 1 || !Number.isInteger(termMonths)) {
    throw new Error('amortize: termMonths must be a positive integer');
  }
  if (principal < 0) {
    throw new Error('amortize: principal must be non-negative');
  }

  const monthlyRate = annualRate / 12;
  const schedule: AmortizationRow[] = [];

  if (monthlyRate === 0) {
    const payment = principal / termMonths;
    let balance = principal;
    for (let p = 1; p <= termMonths; p += 1) {
      balance -= payment;
      const isLast = p === termMonths;
      schedule.push({
        period: p,
        principal: payment,
        interest: 0,
        // Snap the final row to exactly zero to avoid floating drift.
        balance: isLast ? 0 : Math.max(0, balance),
      });
    }
    return { monthlyPayment: payment, totalInterest: 0, schedule };
  }

  // Standard amortization formula.
  const r = monthlyRate;
  const n = termMonths;
  const payment = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  let balance = principal;
  let totalInterest = 0;

  for (let p = 1; p <= termMonths; p += 1) {
    const interest = balance * r;
    let principalPaid = payment - interest;
    let isLast = p === termMonths;

    // Final-row correction: absorb floating residue so balance hits zero
    // exactly and summed-principal === input principal.
    if (isLast) {
      principalPaid = balance;
      balance = 0;
    } else {
      balance -= principalPaid;
    }

    totalInterest += interest;
    schedule.push({
      period: p,
      principal: principalPaid,
      interest,
      balance: isLast ? 0 : Math.max(0, balance),
    });
  }

  return { monthlyPayment: payment, totalInterest, schedule };
}

// ─── Expense Splitter ───────────────────────────────────────────────────────

export interface ExpenseInput {
  payer: string;
  amount: number;
  note?: string;
}

export interface PerPerson {
  name: string;
  /** Sum of every expense this person paid for. */
  paid: number;
  /** Their fair share of the total spend (= total / N). */
  share: number;
  /** paid − share. Positive = owed money. Negative = owes money. */
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface SplitResult {
  perPerson: PerPerson[];
  settlements: Settlement[];
  total: number;
}

const SETTLE_TOL = 0.01; // ±$0.01 — sub-cent floating drift is acceptable.

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute pair-payoff settlements among N people. v1 is naive pair-payoff:
 * largest debtor pays the largest creditor until all balances are within
 * ±$0.01. This is **not** the minimum-transaction-set algorithm — it's
 * simpler and produces results users can sanity-check by hand. Per design
 * Approach A, this is sufficient for v1.
 *
 * Inputs:
 *   - `people`: array of person names. Caller is responsible for ensuring
 *     uniqueness — duplicates are not deduped here.
 *   - `expenses`: array of `{ payer, amount, note? }`. Every `payer` MUST be
 *     present in `people`; every `amount` must be a non-negative finite
 *     number.
 *
 * Throws if any expense.payer is not in people, if `people` is empty, or if
 * any amount is non-finite or negative. NaN / Infinity / -Infinity all reject.
 */
export function splitExpenses(
  people: string[],
  expenses: ExpenseInput[],
): SplitResult {
  if (!Array.isArray(people) || people.length < 1) {
    throw new Error('splitExpenses: people must be a non-empty array');
  }
  const peopleSet = new Set(people);

  // Validate every expense up front so we never produce a partial result.
  for (const ex of expenses) {
    if (!Number.isFinite(ex.amount)) {
      throw new Error('splitExpenses: amount must be a finite number');
    }
    if (ex.amount < 0) {
      throw new Error('splitExpenses: amount must be non-negative');
    }
    if (!peopleSet.has(ex.payer)) {
      throw new Error('splitExpenses: payer not in people list');
    }
  }

  const total = expenses.reduce((sum, ex) => sum + ex.amount, 0);
  const share = people.length > 0 ? total / people.length : 0;

  const paidByName = new Map<string, number>();
  for (const name of people) paidByName.set(name, 0);
  for (const ex of expenses) {
    paidByName.set(ex.payer, (paidByName.get(ex.payer) ?? 0) + ex.amount);
  }

  const perPerson: PerPerson[] = people.map((name) => {
    const paid = paidByName.get(name) ?? 0;
    const net = roundCents(paid - share);
    return {
      name,
      paid: roundCents(paid),
      share: roundCents(share),
      net,
    };
  });

  // Pair-payoff. Work on a mutable copy of nets so we don't disturb perPerson.
  // We snap nets to cents already, so the loop terminates cleanly: the worst
  // case is N-1 settlements (one debtor goes to zero per iteration).
  interface Bal {
    name: string;
    net: number;
  }
  const balances: Bal[] = perPerson.map((p) => ({ name: p.name, net: p.net }));
  const settlements: Settlement[] = [];

  // Hard upper bound on iterations as a safety net against any future bug
  // that could otherwise cause an infinite loop.
  const maxIters = balances.length * balances.length + 1;
  let iter = 0;

  while (iter < maxIters) {
    iter += 1;
    let debtorIdx = -1;
    let creditorIdx = -1;
    let mostNeg = -SETTLE_TOL;
    let mostPos = SETTLE_TOL;
    for (let i = 0; i < balances.length; i += 1) {
      const b = balances[i];
      if (!b) continue;
      if (b.net < mostNeg) {
        mostNeg = b.net;
        debtorIdx = i;
      }
      if (b.net > mostPos) {
        mostPos = b.net;
        creditorIdx = i;
      }
    }
    if (debtorIdx === -1 || creditorIdx === -1) break;
    const debtor = balances[debtorIdx];
    const creditor = balances[creditorIdx];
    if (!debtor || !creditor) break;

    const amount = roundCents(Math.min(-debtor.net, creditor.net));
    if (amount <= 0) break;

    settlements.push({
      from: debtor.name,
      to: creditor.name,
      amount,
    });

    debtor.net = roundCents(debtor.net + amount);
    creditor.net = roundCents(creditor.net - amount);
  }

  return {
    perPerson,
    settlements,
    total: roundCents(total),
  };
}

// ─── Compound Interest / Retirement ─────────────────────────────────────────

export interface CompoundYearRow {
  year: number;
  balance: number;
  contributedToDate: number;
  earnedToDate: number;
}

export interface CompoundResult {
  finalValue: number;
  totalContributed: number;
  totalEarned: number;
  yearly: CompoundYearRow[];
}

/**
 * Future value of `principal` plus a regular monthly contribution, compounded
 * monthly at `annualRate` (decimal) over `years`. Returns the final value
 * plus a year-by-year breakdown for charting.
 *
 * Special cases:
 *   - rate=0 → linear accumulation (principal + 12*contrib*years)
 *   - years=0 → finalValue === principal, no yearly rows
 */
export function compound(
  principal: number,
  annualRate: number,
  monthlyContribution: number,
  years: number,
): CompoundResult {
  requireFinite('compound', principal, annualRate, monthlyContribution, years);
  if (principal < 0 || monthlyContribution < 0 || years < 0) {
    throw new Error('compound: inputs must be non-negative');
  }
  if (!Number.isInteger(years)) {
    throw new Error('compound: years must be an integer');
  }

  if (years === 0) {
    return {
      finalValue: principal,
      totalContributed: principal,
      totalEarned: 0,
      yearly: [],
    };
  }

  const monthlyRate = annualRate / 12;
  const yearly: CompoundYearRow[] = [];
  let balance = principal;
  let contributedToDate = principal;

  for (let year = 1; year <= years; year += 1) {
    for (let m = 1; m <= 12; m += 1) {
      // Interest first (on prior month's balance), then add contribution.
      // This matches end-of-period contribution timing — the most common
      // convention for retirement projections.
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      contributedToDate += monthlyContribution;
    }
    yearly.push({
      year,
      balance,
      contributedToDate,
      earnedToDate: balance - contributedToDate,
    });
  }

  return {
    finalValue: balance,
    totalContributed: contributedToDate,
    totalEarned: balance - contributedToDate,
    yearly,
  };
}

// ─── Tax brackets ───────────────────────────────────────────────────────────

export interface TaxBracket {
  /** Inclusive upper bound of this bracket; `null` means no upper bound. */
  upTo: number | null;
  /** Marginal rate as a decimal (0.10 for 10%). */
  rate: number;
}

export interface TaxOwedResult {
  taxOwed: number;
  /** Marginal rate as a decimal — the rate of the bracket the income falls into. */
  marginalRate: number;
  /** Effective rate = taxOwed / taxableIncome (zero when income is zero). */
  effectiveRate: number;
}

/**
 * Compute progressive tax on `taxableIncome` against a sorted bracket list.
 * The final bracket must have `upTo: null` to mean "infinity"; otherwise we
 * could silently fail to tax the highest-bracket portion of income.
 *
 * Throws on an empty bracket list or a list whose final bracket is bounded —
 * those are upstream data-integrity bugs, not user input errors.
 */
export function taxOwed(
  taxableIncome: number,
  brackets: ReadonlyArray<TaxBracket>,
): TaxOwedResult {
  requireFinite('taxOwed', taxableIncome);
  if (brackets.length === 0) {
    throw new Error('taxOwed: brackets must not be empty');
  }
  const last = brackets[brackets.length - 1];
  if (!last || last.upTo !== null) {
    throw new Error('taxOwed: final bracket must be unbounded (upTo: null)');
  }
  if (taxableIncome <= 0) {
    return {
      taxOwed: 0,
      marginalRate: brackets[0]?.rate ?? 0,
      effectiveRate: 0,
    };
  }

  let total = 0;
  let prevCap = 0;
  let marginalRate = brackets[0]?.rate ?? 0;

  for (const bracket of brackets) {
    const cap = bracket.upTo ?? Number.POSITIVE_INFINITY;
    const taxableInBracket = Math.max(
      0,
      Math.min(taxableIncome, cap) - prevCap,
    );
    if (taxableInBracket > 0) {
      total += taxableInBracket * bracket.rate;
      marginalRate = bracket.rate;
    }
    if (taxableIncome <= cap) break;
    prevCap = cap;
  }

  return {
    taxOwed: total,
    marginalRate,
    effectiveRate: total / taxableIncome,
  };
}

// ─── Paycheck (federal income + FICA) ───────────────────────────────────────

export type FilingStatus =
  | 'single'
  | 'marriedJointly'
  | 'marriedSeparate'
  | 'headOfHousehold';

export type PayPeriod =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'annual';

export interface PaycheckInputs {
  grossPerPeriod: number;
  period: PayPeriod;
  filingStatus: FilingStatus;
  /** Year-to-date wages already paid (0 when omitted). */
  ytdWages?: number;
}

export interface PaycheckResult {
  grossPerPeriod: number;
  annualGross: number;
  /** Per-period federal income tax. */
  federalIncomeTax: number;
  /** Per-period 6.2% OASDI. */
  socialSecurity: number;
  /** Per-period 1.45% Medicare. */
  medicare: number;
  /** Per-period extra 0.9% on wages above the Additional Medicare threshold. */
  additionalMedicare: number;
  /** Per-period net pay. */
  netPay: number;
}

/**
 * Shape we expect from the bundled `tax-fed` snapshot. We accept the data
 * loosely (`unknown` from IPC) and validate only the fields we read.
 *
 * Two shapes are accepted by `asTaxFedShape` and normalized here:
 *
 *   1. **Bundled shape** (matches `src-tauri/resources/finance/tax-fed.json`):
 *      `{ filingStatuses: { single: { standardDeduction, brackets }, ... }, fica }`
 *   2. **Flat shape** (used by tests and any caller that has already
 *      destructured): `{ brackets, standardDeduction, fica }`
 *
 * Internally the math always operates on the flat shape.
 */
interface TaxFedShape {
  brackets: Record<FilingStatus, TaxBracket[]>;
  standardDeduction: Record<FilingStatus, number>;
  fica: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: Record<FilingStatus, number>;
  };
}

function periodsPerYear(period: PayPeriod): number {
  switch (period) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'semimonthly':
      return 24;
    case 'monthly':
      return 12;
    case 'annual':
      return 1;
  }
}

function isFilingStatus(value: unknown): value is FilingStatus {
  return (
    value === 'single' ||
    value === 'marriedJointly' ||
    value === 'marriedSeparate' ||
    value === 'headOfHousehold'
  );
}

const FILING_STATUSES: ReadonlyArray<FilingStatus> = [
  'single',
  'marriedJointly',
  'marriedSeparate',
  'headOfHousehold',
];

function asTaxFedShape(raw: unknown): TaxFedShape {
  if (!raw || typeof raw !== 'object') {
    throw new Error('paycheck: tax data is not an object');
  }
  const obj = raw as Record<string, unknown>;
  const fica = obj.fica as TaxFedShape['fica'] | undefined;
  if (!fica) {
    throw new Error('paycheck: tax data missing required fields');
  }

  // Bundled shape: `{ filingStatuses: { <status>: { standardDeduction, brackets } } }`
  const filingStatuses = obj.filingStatuses as
    | Record<string, { standardDeduction?: number; brackets?: TaxBracket[] }>
    | undefined;
  if (filingStatuses && typeof filingStatuses === 'object') {
    const brackets = {} as Record<FilingStatus, TaxBracket[]>;
    const standardDeduction = {} as Record<FilingStatus, number>;
    for (const status of FILING_STATUSES) {
      const entry = filingStatuses[status];
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.standardDeduction !== 'number' ||
        !Array.isArray(entry.brackets)
      ) {
        throw new Error('paycheck: tax data missing for filing status');
      }
      brackets[status] = entry.brackets;
      standardDeduction[status] = entry.standardDeduction;
    }
    return { brackets, standardDeduction, fica };
  }

  // Flat shape (test fixtures + already-normalized callers).
  const brackets = obj.brackets as TaxFedShape['brackets'] | undefined;
  const standardDeduction = obj.standardDeduction as
    | TaxFedShape['standardDeduction']
    | undefined;
  if (!brackets || !standardDeduction) {
    throw new Error('paycheck: tax data missing required fields');
  }
  return { brackets, standardDeduction, fica };
}

/**
 * Net pay calculator: federal income + FICA only. State / local / pre-tax
 * benefits are explicit non-goals in v1 — the disclaimer banner makes that
 * clear in the UI.
 *
 * Federal income tax is computed by annualizing gross, subtracting the
 * filing-status standard deduction, applying brackets, then dividing back to
 * the period. This is how W-4 post-2020 simplified withholding works for
 * estimation purposes (not byte-for-byte payroll).
 */
export function paycheck(
  inputs: PaycheckInputs,
  taxData: unknown,
): PaycheckResult {
  if (!isFilingStatus(inputs.filingStatus)) {
    throw new Error('paycheck: invalid filing status');
  }
  requireFinite('paycheck', inputs.grossPerPeriod);

  const data = asTaxFedShape(taxData);
  const periods = periodsPerYear(inputs.period);
  const annualGross = inputs.grossPerPeriod * periods;

  const standardDeduction = data.standardDeduction[inputs.filingStatus];
  const brackets = data.brackets[inputs.filingStatus];
  if (typeof standardDeduction !== 'number' || !brackets) {
    throw new Error('paycheck: tax data missing for filing status');
  }

  const taxableAnnual = Math.max(0, annualGross - standardDeduction);
  const federalAnnual = taxOwed(taxableAnnual, brackets).taxOwed;
  const federalIncomeTax = federalAnnual / periods;

  // Social Security: 6.2% up to the wage base. We track YTD wages so a high
  // earner's per-period SS drops once the cap is hit.
  const ytd = inputs.ytdWages ?? 0;
  const ssWageBase = data.fica.socialSecurityWageBase;
  const ssRate = data.fica.socialSecurityRate;
  const ssEligibleAnnual = Math.max(0, Math.min(annualGross + ytd, ssWageBase) - ytd);
  const ssEligibleThisPeriod = Math.min(
    inputs.grossPerPeriod,
    Math.max(0, ssEligibleAnnual / periods),
  );
  // Cleaner approach: compute SS from annualized eligible pay, divide back.
  const annualSsTaxable = Math.max(0, Math.min(annualGross, Math.max(0, ssWageBase - ytd)));
  const annualSocialSecurity = annualSsTaxable * ssRate;
  const socialSecurity = annualSocialSecurity / periods;
  // ssEligibleThisPeriod is intentionally not used in v1; left for v2 where
  // we may emit a "SS cap reached" banner mid-year.
  void ssEligibleThisPeriod;

  // Medicare: 1.45% on all wages.
  const medicareRate = data.fica.medicareRate;
  const medicare = inputs.grossPerPeriod * medicareRate;

  // Additional Medicare: 0.9% on wages above the filing-status threshold.
  const addlThreshold =
    data.fica.additionalMedicareThreshold[inputs.filingStatus] ?? 0;
  const addlRate = data.fica.additionalMedicareRate;
  const annualOver = Math.max(0, annualGross - addlThreshold);
  const annualAddl = annualOver * addlRate;
  const additionalMedicare = annualAddl / periods;

  const netPay =
    inputs.grossPerPeriod -
    federalIncomeTax -
    socialSecurity -
    medicare -
    additionalMedicare;

  return {
    grossPerPeriod: inputs.grossPerPeriod,
    annualGross,
    federalIncomeTax,
    socialSecurity,
    medicare,
    additionalMedicare,
    netPay,
  };
}
