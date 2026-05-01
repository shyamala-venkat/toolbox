import { test, expect } from '@playwright/test';

test.describe('Tip Splitter tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/tip-splitter');
    await expect(page.locator('h1', { hasText: 'Tip Splitter' })).toBeVisible();
  });

  test('happy path: $100 bill with 18% tip split 2 ways shows $59.00 per person', async ({ page }) => {
    const bill = page.locator('input[aria-label="Bill amount"]');
    const tip = page.locator('input[aria-label="Tip percentage"]');
    const party = page.locator('input[aria-label="Party size"]');

    await expect(bill).toBeVisible();
    await expect(tip).toHaveValue('18');
    await expect(party).toHaveValue('2');

    await bill.fill('100');

    // Wait for debounce to settle.
    await page.waitForTimeout(300);

    const result = page.locator('[aria-label="Per person amount"]');
    await expect(result).toHaveText('$59.00', { timeout: 3000 });

    // Copy button is enabled with a non-empty payload.
    const copyBtn = page.locator('button', { hasText: 'Copy' });
    await expect(copyBtn).toBeEnabled();
  });

  test('malformed input renders em-dash and inline error without crashing', async ({ page }) => {
    const bill = page.locator('input[aria-label="Bill amount"]');
    const party = page.locator('input[aria-label="Party size"]');
    const result = page.locator('[aria-label="Per person amount"]');

    // Garbage input → em-dash + visible error.
    await bill.fill('abc');
    await page.waitForTimeout(300);
    await expect(result).toHaveText('—');
    await expect(page.locator('text=Bill must be a number')).toBeVisible();

    // Zero bill → still no result, no crash.
    await bill.fill('0');
    await page.waitForTimeout(300);
    await expect(result).toHaveText('—');

    // Invalid party (zero) → inline error.
    await bill.fill('100');
    await party.fill('0');
    await page.waitForTimeout(300);
    await expect(page.locator('text=Party size must be at least 1')).toBeVisible();
    await expect(result).toHaveText('—');

    // Page header still visible — no error boundary engagement.
    await expect(page.locator('h1', { hasText: 'Tip Splitter' })).toBeVisible();
  });
});
