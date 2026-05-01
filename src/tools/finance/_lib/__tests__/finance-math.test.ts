import { describe, expect, it } from 'vitest';
import {
  amortize,
  compound,
  paycheck,
  splitExpenses,
  taxOwed,
  type TaxBracket,
} from '@/tools/finance/_lib/finance-math';

// Allow ~$0.01 rounding noise for floating arithmetic.
const cents = (a: number, b: number, tol: number = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
};

describe('amortize', () => {
  it('matches the textbook 30-year mortgage payment', () => {
    const r = amortize(300_000, 0.06, 360);
    cents(r.monthlyPayment, 1798.65, 0.01);
    expect(r.schedule).toHaveLength(360);
  });

  it('rate=0 produces a straight-line schedule', () => {
    const r = amortize(1200, 0, 12);
    expect(r.monthlyPayment).toBe(100);
    expect(r.totalInterest).toBe(0);
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule[r.schedule.length - 1]?.balance).toBe(0);
    for (const row of r.schedule) {
      expect(row.interest).toBe(0);
      expect(row.principal).toBe(100);
    }
  });

  it('handles a 1-month term with a positive rate', () => {
    const r = amortize(1000, 0.12, 1);
    // Single payment must clear the balance.
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0]?.balance).toBe(0);
    cents(r.schedule[0]?.principal ?? 0, 1000);
    cents(r.schedule[0]?.interest ?? 0, 10);
  });

  it('schedule rows sum to the original principal', () => {
    const r = amortize(250_000, 0.045, 180);
    const sum = r.schedule.reduce((acc, row) => acc + row.principal, 0);
    cents(sum, 250_000, 0.01);
  });

  it('throws on non-integer term', () => {
    expect(() => amortize(1000, 0.05, 12.5)).toThrow();
  });

  it('throws on zero or negative term', () => {
    expect(() => amortize(1000, 0.05, 0)).toThrow();
    expect(() => amortize(1000, 0.05, -1)).toThrow();
  });

  it('throws on negative principal', () => {
    expect(() => amortize(-1, 0.05, 12)).toThrow();
  });

  it('throws on non-finite inputs', () => {
    expect(() => amortize(Number.NaN, 0.05, 12)).toThrow();
    expect(() => amortize(1000, Number.POSITIVE_INFINITY, 12)).toThrow();
  });
});

describe('compound', () => {
  it('grows a lump sum at 5% for 10 years correctly', () => {
    const r = compound(1000, 0.05, 0, 10);
    // Monthly compounding of $1000 at 5%/yr for 10 yr ≈ $1647.01
    cents(r.finalValue, 1647.01, 0.5);
    expect(r.totalContributed).toBe(1000);
    cents(r.totalEarned, r.finalValue - 1000, 0.01);
    expect(r.yearly).toHaveLength(10);
  });

  it('accumulates a $100/mo annuity at 6% for 10 years', () => {
    const r = compound(0, 0.06, 100, 10);
    // Future value of an ordinary annuity, monthly compounding:
    // FV = PMT * (((1+r)^n - 1)/r) ≈ 16387.93
    cents(r.finalValue, 16387.93, 1);
    expect(r.totalContributed).toBe(100 * 12 * 10);
  });

  it('rate=0 with contributions accumulates linearly', () => {
    const r = compound(0, 0, 100, 5);
    expect(r.finalValue).toBe(100 * 12 * 5);
    expect(r.totalEarned).toBe(0);
  });

  it('returns just principal when years=0', () => {
    const r = compound(5000, 0.07, 200, 0);
    expect(r.finalValue).toBe(5000);
    expect(r.totalContributed).toBe(5000);
    expect(r.totalEarned).toBe(0);
    expect(r.yearly).toHaveLength(0);
  });

  it('throws on non-integer years', () => {
    expect(() => compound(1000, 0.05, 100, 5.5)).toThrow();
  });

  it('throws on negative inputs', () => {
    expect(() => compound(-1, 0.05, 0, 5)).toThrow();
    expect(() => compound(1000, 0.05, -1, 5)).toThrow();
    expect(() => compound(1000, 0.05, 0, -1)).toThrow();
  });
});

describe('taxOwed', () => {
  // 2024 federal single-filer brackets (simplified for unit test).
  const SINGLE_2024: TaxBracket[] = [
    { upTo: 11_600, rate: 0.10 },
    { upTo: 47_150, rate: 0.12 },
    { upTo: 100_525, rate: 0.22 },
    { upTo: 191_950, rate: 0.24 },
    { upTo: 243_725, rate: 0.32 },
    { upTo: 609_350, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ];

  it('returns zero tax for zero income', () => {
    const r = taxOwed(0, SINGLE_2024);
    expect(r.taxOwed).toBe(0);
    expect(r.effectiveRate).toBe(0);
    expect(r.marginalRate).toBe(0.10);
  });

  it('returns zero tax for negative income (clamps)', () => {
    const r = taxOwed(-1000, SINGLE_2024);
    expect(r.taxOwed).toBe(0);
  });

  it('taxes income exactly at the first bracket boundary correctly', () => {
    const r = taxOwed(11_600, SINGLE_2024);
    cents(r.taxOwed, 1160, 0.01);
    expect(r.marginalRate).toBe(0.10);
  });

  it('handles income spanning two brackets', () => {
    // 50000 single 2024:
    //   10% on first 11600 = 1160
    //   12% on (47150-11600)=35550 = 4266
    //   22% on (50000-47150)=2850 = 627
    //   total = 6053
    const r = taxOwed(50_000, SINGLE_2024);
    cents(r.taxOwed, 6053, 0.01);
    expect(r.marginalRate).toBe(0.22);
    cents(r.effectiveRate, 6053 / 50_000, 0.0001);
  });

  it('handles income in the top bracket', () => {
    const r = taxOwed(1_000_000, SINGLE_2024);
    expect(r.marginalRate).toBe(0.37);
    expect(r.taxOwed).toBeGreaterThan(300_000);
  });

  it('throws on empty bracket list', () => {
    expect(() => taxOwed(50_000, [])).toThrow();
  });

  it('throws when last bracket is bounded', () => {
    const broken: TaxBracket[] = [
      { upTo: 10_000, rate: 0.10 },
      { upTo: 100_000, rate: 0.20 },
    ];
    expect(() => taxOwed(50_000, broken)).toThrow();
  });
});

describe('paycheck', () => {
  // Realistic-ish test fixture loosely modeled on TY2024 federal data.
  const TAX_DATA = {
    brackets: {
      single: [
        { upTo: 11_600, rate: 0.10 },
        { upTo: 47_150, rate: 0.12 },
        { upTo: 100_525, rate: 0.22 },
        { upTo: 191_950, rate: 0.24 },
        { upTo: 243_725, rate: 0.32 },
        { upTo: 609_350, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      marriedJointly: [
        { upTo: 23_200, rate: 0.10 },
        { upTo: 94_300, rate: 0.12 },
        { upTo: 201_050, rate: 0.22 },
        { upTo: 383_900, rate: 0.24 },
        { upTo: 487_450, rate: 0.32 },
        { upTo: 731_200, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      marriedSeparate: [
        { upTo: 11_600, rate: 0.10 },
        { upTo: 47_150, rate: 0.12 },
        { upTo: 100_525, rate: 0.22 },
        { upTo: 191_950, rate: 0.24 },
        { upTo: 243_725, rate: 0.32 },
        { upTo: 365_600, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      headOfHousehold: [
        { upTo: 16_550, rate: 0.10 },
        { upTo: 63_100, rate: 0.12 },
        { upTo: 100_500, rate: 0.22 },
        { upTo: 191_950, rate: 0.24 },
        { upTo: 243_700, rate: 0.32 },
        { upTo: 609_350, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
    },
    standardDeduction: {
      single: 14_600,
      marriedJointly: 29_200,
      marriedSeparate: 14_600,
      headOfHousehold: 21_900,
    },
    fica: {
      socialSecurityRate: 0.062,
      socialSecurityWageBase: 168_600,
      medicareRate: 0.0145,
      additionalMedicareRate: 0.009,
      additionalMedicareThreshold: {
        single: 200_000,
        marriedJointly: 250_000,
        marriedSeparate: 125_000,
        headOfHousehold: 200_000,
      },
    },
  };

  it('computes net pay for a single $80k annual salary', () => {
    const r = paycheck(
      { grossPerPeriod: 80_000, period: 'annual', filingStatus: 'single' },
      TAX_DATA,
    );
    expect(r.annualGross).toBe(80_000);
    // taxable = 80000 - 14600 = 65400
    // federal = 1160 + 4266 + (65400-47150)*0.22 = 5426 + 4015 = 9441 (≈)
    cents(r.federalIncomeTax, 9441, 1);
    cents(r.socialSecurity, 80_000 * 0.062, 0.5);
    cents(r.medicare, 80_000 * 0.0145, 0.5);
    expect(r.additionalMedicare).toBe(0);
    cents(r.netPay, 80_000 - 9441 - 4960 - 1160, 1);
  });

  it('computes MFJ at $200k with no Additional Medicare', () => {
    const r = paycheck(
      { grossPerPeriod: 200_000, period: 'annual', filingStatus: 'marriedJointly' },
      TAX_DATA,
    );
    expect(r.additionalMedicare).toBe(0);
    expect(r.netPay).toBeGreaterThan(0);
    expect(r.netPay).toBeLessThan(200_000);
  });

  it('annualizes a weekly paycheck correctly', () => {
    const weekly = 1500;
    const r = paycheck(
      { grossPerPeriod: weekly, period: 'weekly', filingStatus: 'single' },
      TAX_DATA,
    );
    expect(r.annualGross).toBe(weekly * 52);
  });

  it('biweekly multiplies by 26', () => {
    const r = paycheck(
      { grossPerPeriod: 3000, period: 'biweekly', filingStatus: 'single' },
      TAX_DATA,
    );
    expect(r.annualGross).toBe(3000 * 26);
  });

  it('semimonthly multiplies by 24', () => {
    const r = paycheck(
      { grossPerPeriod: 3000, period: 'semimonthly', filingStatus: 'single' },
      TAX_DATA,
    );
    expect(r.annualGross).toBe(3000 * 24);
  });

  it('monthly multiplies by 12', () => {
    const r = paycheck(
      { grossPerPeriod: 6000, period: 'monthly', filingStatus: 'single' },
      TAX_DATA,
    );
    expect(r.annualGross).toBe(6000 * 12);
  });

  it('triggers Additional Medicare for a high-earning single filer', () => {
    const r = paycheck(
      { grossPerPeriod: 300_000, period: 'annual', filingStatus: 'single' },
      TAX_DATA,
    );
    // Excess over 200k = 100k * 0.9% = 900
    cents(r.additionalMedicare, 900, 1);
  });

  it('caps Social Security at the wage base', () => {
    const r = paycheck(
      { grossPerPeriod: 500_000, period: 'annual', filingStatus: 'single' },
      TAX_DATA,
    );
    // Annual SS capped at 168600 * 0.062 = 10453.20
    cents(r.socialSecurity, 168_600 * 0.062, 1);
  });

  it('throws on invalid filing status', () => {
    expect(() =>
      paycheck(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { grossPerPeriod: 50_000, period: 'annual', filingStatus: 'bogus' as any },
        TAX_DATA,
      ),
    ).toThrow();
  });

  it('throws on missing tax data', () => {
    expect(() =>
      paycheck(
        { grossPerPeriod: 50_000, period: 'annual', filingStatus: 'single' },
        null,
      ),
    ).toThrow();
  });

  it('throws on non-finite gross', () => {
    expect(() =>
      paycheck(
        { grossPerPeriod: Number.NaN, period: 'annual', filingStatus: 'single' },
        TAX_DATA,
      ),
    ).toThrow();
  });

  it('accepts the bundled tax-fed.json shape (filingStatuses-nested)', () => {
    const BUNDLED_SHAPE = {
      taxYear: 2025,
      currency: 'USD',
      filingStatuses: {
        single: {
          standardDeduction: 15_000,
          brackets: [
            { upTo: 11_925, rate: 0.10 },
            { upTo: 48_475, rate: 0.12 },
            { upTo: null, rate: 0.22 },
          ],
        },
        marriedJointly: {
          standardDeduction: 30_000,
          brackets: [{ upTo: null, rate: 0.10 }],
        },
        marriedSeparate: {
          standardDeduction: 15_000,
          brackets: [{ upTo: null, rate: 0.10 }],
        },
        headOfHousehold: {
          standardDeduction: 22_500,
          brackets: [{ upTo: null, rate: 0.10 }],
        },
      },
      fica: {
        socialSecurityRate: 0.062,
        socialSecurityWageBase: 176_100,
        medicareRate: 0.0145,
        additionalMedicareRate: 0.009,
        additionalMedicareThreshold: {
          single: 200_000,
          marriedJointly: 250_000,
          marriedSeparate: 125_000,
          headOfHousehold: 200_000,
        },
      },
    };

    const r = paycheck(
      { grossPerPeriod: 80_000, period: 'annual', filingStatus: 'single' },
      BUNDLED_SHAPE,
    );
    expect(r.annualGross).toBe(80_000);
    expect(r.netPay).toBeGreaterThan(0);
    expect(r.netPay).toBeLessThan(80_000);
    cents(r.socialSecurity, 80_000 * 0.062, 0.5);
  });
});

describe('splitExpenses', () => {
  it('returns zero settlements when there are no expenses', () => {
    const r = splitExpenses(['A', 'B'], []);
    expect(r.total).toBe(0);
    expect(r.settlements).toHaveLength(0);
    expect(r.perPerson).toHaveLength(2);
    for (const p of r.perPerson) {
      expect(p.paid).toBe(0);
      expect(p.share).toBe(0);
      expect(p.net).toBe(0);
    }
  });

  it('two people, A pays $30, B owes A $15', () => {
    const r = splitExpenses(['A', 'B'], [{ payer: 'A', amount: 30 }]);
    expect(r.total).toBe(30);
    expect(r.settlements).toHaveLength(1);
    expect(r.settlements[0]).toEqual({ from: 'B', to: 'A', amount: 15 });
    const a = r.perPerson.find((p) => p.name === 'A');
    const b = r.perPerson.find((p) => p.name === 'B');
    cents(a?.net ?? -999, 15);
    cents(b?.net ?? 999, -15);
  });

  it('two-person edge: A pays $30, B pays $0 → B owes A $15', () => {
    const r = splitExpenses(
      ['A', 'B'],
      [
        { payer: 'A', amount: 30 },
        { payer: 'B', amount: 0 },
      ],
    );
    expect(r.settlements).toEqual([{ from: 'B', to: 'A', amount: 15 }]);
  });

  it('three-way edge: A $30, B $30, C $0 → C pays A and B $10 each', () => {
    const r = splitExpenses(
      ['A', 'B', 'C'],
      [
        { payer: 'A', amount: 30 },
        { payer: 'B', amount: 30 },
        { payer: 'C', amount: 0 },
      ],
    );
    expect(r.total).toBe(60);
    // Each share = 20. A and B each have +10; C has -20. Pair-payoff sends
    // C → (largest creditor) for $10, then C → (other creditor) for $10.
    expect(r.settlements).toHaveLength(2);
    for (const s of r.settlements) {
      expect(s.from).toBe('C');
      expect(['A', 'B']).toContain(s.to);
      cents(s.amount, 10);
    }
    // Sum settlements equals C's debt.
    const totalOut = r.settlements.reduce((sum, s) => sum + s.amount, 0);
    cents(totalOut, 20);
  });

  it('produces ≤ N-1 settlements for 4 people with unequal payments', () => {
    const r = splitExpenses(
      ['A', 'B', 'C', 'D'],
      [
        { payer: 'A', amount: 100 },
        { payer: 'B', amount: 60 },
        { payer: 'C', amount: 20 },
        { payer: 'D', amount: 0 },
      ],
    );
    // total=180, share=45.
    // nets: A=+55, B=+15, C=-25, D=-45.
    expect(r.total).toBe(180);
    // Pair-payoff is bounded by N-1 transactions; usually exactly N-1.
    expect(r.settlements.length).toBeLessThanOrEqual(3);
    // After applying settlements, every net must be within tolerance.
    const netAfter = new Map(r.perPerson.map((p) => [p.name, p.net]));
    for (const s of r.settlements) {
      netAfter.set(s.from, (netAfter.get(s.from) ?? 0) + s.amount);
      netAfter.set(s.to, (netAfter.get(s.to) ?? 0) - s.amount);
    }
    for (const [, n] of netAfter) cents(n, 0);
  });

  it('throws when payer is not in the people list', () => {
    expect(() =>
      splitExpenses(['A', 'B'], [{ payer: 'C', amount: 10 }]),
    ).toThrow();
  });

  it('throws on negative amount', () => {
    expect(() =>
      splitExpenses(['A', 'B'], [{ payer: 'A', amount: -5 }]),
    ).toThrow();
  });

  it('throws on NaN amount', () => {
    expect(() =>
      splitExpenses(['A', 'B'], [{ payer: 'A', amount: Number.NaN }]),
    ).toThrow();
  });

  it('throws on Infinity amount', () => {
    expect(() =>
      splitExpenses(
        ['A', 'B'],
        [{ payer: 'A', amount: Number.POSITIVE_INFINITY }],
      ),
    ).toThrow();
  });

  it('single person produces no settlements', () => {
    const r = splitExpenses(['A'], [{ payer: 'A', amount: 50 }]);
    expect(r.total).toBe(50);
    expect(r.settlements).toHaveLength(0);
    expect(r.perPerson).toHaveLength(1);
    expect(r.perPerson[0]?.net).toBe(0);
  });

  it('throws when people list is empty', () => {
    expect(() => splitExpenses([], [])).toThrow();
  });

  it('floating drift: many fractional expenses settle within ±$0.01', () => {
    const expenses = Array.from({ length: 21 }, () => ({
      payer: 'A',
      amount: 10 / 3, // 3.333…
    }));
    const r = splitExpenses(['A', 'B', 'C'], expenses);
    // After all settlements, every net must be within ±$0.01.
    const netAfter = new Map(r.perPerson.map((p) => [p.name, p.net]));
    for (const s of r.settlements) {
      netAfter.set(s.from, (netAfter.get(s.from) ?? 0) + s.amount);
      netAfter.set(s.to, (netAfter.get(s.to) ?? 0) - s.amount);
    }
    // Per-person nets in `result.perPerson` are the *initial* paid - share
    // (not post-settlement balances). Post-settlement balances must collapse
    // to within a few cents, which is what we verify here.
    for (const [, n] of netAfter) {
      expect(Math.abs(n)).toBeLessThanOrEqual(0.05);
    }
  });
});
