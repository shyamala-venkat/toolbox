import { test, expect } from '@playwright/test';

test.describe('Mortgage Calculator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/mortgage');
    await expect(page.locator('h1', { hasText: 'Mortgage Calculator' })).toBeVisible();
  });

  test('disclaimer banner is visibly rendered before any input', async ({ page }) => {
    // CRITICAL gate from /plan-eng-review: the disclaimer must be VISIBLE,
    // not just present in the DOM, even before any computation.
    const banner = page.locator('[role="note"]').filter({ hasText: /Estimate only/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      /Excludes HOA, closing costs, and PMI auto-drop/i,
    );
    await expect(banner).toContainText(/lender's quote is authoritative/i);

    // Result block shows em-dash placeholder.
    const totalMonthly = page.locator('[aria-label="Total monthly payment"]');
    await expect(totalMonthly).toHaveText('—');
  });

  test('happy path with escrow: 300k @ 6% / 30y + tax + insurance ≈ $2,298.65', async ({
    page,
  }) => {
    await page.locator('input[aria-label="Loan amount"]').fill('300000');
    await page.locator('input[aria-label="Annual rate"]').fill('6');
    await page.locator('input[aria-label="Term"]').fill('30');
    await page.locator('input[aria-label="Annual property tax"]').fill('4800');
    await page.locator('input[aria-label="Annual insurance"]').fill('1200');

    await page.waitForTimeout(300);

    const totalMonthly = page.locator('[aria-label="Total monthly payment"]');
    await expect(totalMonthly).toHaveText('$2,298.65', { timeout: 3000 });

    // Breakdown lines are populated.
    await expect(page.locator('[aria-label="P and I monthly amount"]')).toHaveText(
      '$1,798.65',
    );
    await expect(page.locator('[aria-label="Property tax monthly amount"]')).toHaveText(
      '$400.00',
    );
    await expect(page.locator('[aria-label="Insurance monthly amount"]')).toHaveText(
      '$100.00',
    );

    // Disclaimer still visible after a successful calculation.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    // Chart canvas is present.
    const chart = page.locator('[role="img"][aria-label*="Loan balance over time"]');
    await expect(chart).toBeVisible();
  });

  test('no-escrow path: 200k @ 5% / 15y P&I only ≈ $1,581.59', async ({ page }) => {
    await page.locator('input[aria-label="Loan amount"]').fill('200000');
    await page.locator('input[aria-label="Annual rate"]').fill('5');
    await page.locator('input[aria-label="Term"]').fill('15');

    await page.waitForTimeout(300);

    const totalMonthly = page.locator('[aria-label="Total monthly payment"]');
    await expect(totalMonthly).toHaveText('$1,581.59', { timeout: 3000 });

    // Tax / insurance lines show em-dash because they were left blank.
    await expect(page.locator('[aria-label="Property tax monthly amount"]')).toHaveText(
      '—',
    );
    await expect(page.locator('[aria-label="Insurance monthly amount"]')).toHaveText(
      '—',
    );

    // Disclaimer still visible.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();
  });

  test('malformed rate renders em-dash, inline error, and disclaimer stays visible', async ({
    page,
  }) => {
    await page.locator('input[aria-label="Loan amount"]').fill('100000');
    await page.locator('input[aria-label="Annual rate"]').fill('abc');
    await page.locator('input[aria-label="Term"]').fill('30');

    await page.waitForTimeout(300);

    const totalMonthly = page.locator('[aria-label="Total monthly payment"]');
    await expect(totalMonthly).toHaveText('—');

    await expect(page.locator('text=Annual rate must be a number')).toBeVisible();

    // Disclaimer is the critical gate — must remain visible during error state.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    // Tool header still visible — no error boundary engagement.
    await expect(page.locator('h1', { hasText: 'Mortgage Calculator' })).toBeVisible();
  });
});
