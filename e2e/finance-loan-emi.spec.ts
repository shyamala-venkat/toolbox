import { test, expect } from '@playwright/test';

test.describe('Loan / EMI Calculator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/loan-emi');
    await expect(page.locator('h1', { hasText: 'Loan / EMI Calculator' })).toBeVisible();
  });

  test('happy path: 300k @ 6% over 360 months shows ~$1,798.65 monthly', async ({ page }) => {
    const principal = page.locator('input[aria-label="Principal"]');
    const rate = page.locator('input[aria-label="Annual rate"]');
    const term = page.locator('input[aria-label="Term"]');
    const unit = page.locator('select[aria-label="Term unit"]');

    // Switch unit to months so the spec's "360 months" matches the input.
    await unit.selectOption('months');

    await principal.fill('300000');
    await rate.fill('6');
    await term.fill('360');

    await page.waitForTimeout(300);

    const monthly = page.locator('[aria-label="Monthly payment amount"]');
    await expect(monthly).toHaveText('$1,798.65', { timeout: 3000 });

    // Chart canvas is present with role=img.
    const chart = page.locator('[role="img"][aria-label*="Loan balance over time"]');
    await expect(chart).toBeVisible();

    // Schedule disclosure expands.
    const summary = page.locator('summary', { hasText: 'Show full schedule' });
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.locator('table[aria-label="Amortization schedule"]')).toBeVisible();
  });

  test('rate=0 shows straight-line $1,000 payment and zero-rate banner', async ({ page }) => {
    const principal = page.locator('input[aria-label="Principal"]');
    const rate = page.locator('input[aria-label="Annual rate"]');
    const term = page.locator('input[aria-label="Term"]');
    const unit = page.locator('select[aria-label="Term unit"]');

    await unit.selectOption('months');
    await principal.fill('12000');
    await rate.fill('0');
    await term.fill('12');

    await page.waitForTimeout(300);

    const monthly = page.locator('[aria-label="Monthly payment amount"]');
    await expect(monthly).toHaveText('$1,000.00', { timeout: 3000 });

    // Zero-rate info banner is visible.
    await expect(page.locator('text=0% interest')).toBeVisible();
    await expect(page.locator('text=Straight-line amortization')).toBeVisible();
  });

  test('malformed rate renders em-dash and inline error without crashing', async ({ page }) => {
    const principal = page.locator('input[aria-label="Principal"]');
    const rate = page.locator('input[aria-label="Annual rate"]');
    const term = page.locator('input[aria-label="Term"]');
    const unit = page.locator('select[aria-label="Term unit"]');

    await unit.selectOption('months');
    await principal.fill('100000');
    await rate.fill('abc');
    await term.fill('120');

    await page.waitForTimeout(300);

    const monthly = page.locator('[aria-label="Monthly payment amount"]');
    await expect(monthly).toHaveText('—');

    await expect(page.locator('text=Annual rate must be a number')).toBeVisible();

    // Tool header still visible — no error boundary engagement.
    await expect(page.locator('h1', { hasText: 'Loan / EMI Calculator' })).toBeVisible();
  });
});
