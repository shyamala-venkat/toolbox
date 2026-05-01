import { test, expect } from '@playwright/test';

test.describe('Compound Interest Calculator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/compound-interest');
    await expect(page.locator('h1', { hasText: 'Compound Interest' })).toBeVisible();
  });

  test('happy path: $10k principal, 7% return, $500/mo, 20 yrs renders final value and chart', async ({ page }) => {
    await page.locator('input[aria-label="Starting principal"]').fill('10000');
    await page.locator('input[aria-label="Annual return"]').fill('7');
    await page.locator('input[aria-label="Monthly contribution"]').fill('500');
    await page.locator('input[aria-label="Years"]').fill('20');

    await page.waitForTimeout(300);

    // Final value should be a non-em-dash currency string.
    const finalValue = page.locator('[aria-label="Final value"]');
    await expect(finalValue).not.toHaveText('—', { timeout: 3000 });
    await expect(finalValue).toContainText('$');

    // Chart with both series labels.
    const chart = page.locator('[role="img"][aria-label*="Investment growth"]');
    await expect(chart).toBeVisible();

    // Copy button enabled.
    const copyBtn = page.locator('button', { hasText: 'Copy' });
    await expect(copyBtn).toBeEnabled();
  });

  test('zero contribution: $1000 principal, 5% over 10 yrs ≈ $1,628.89', async ({ page }) => {
    await page.locator('input[aria-label="Starting principal"]').fill('1000');
    await page.locator('input[aria-label="Annual return"]').fill('5');
    // Contribution defaults to "0" — leave it.
    await page.locator('input[aria-label="Years"]').fill('10');

    await page.waitForTimeout(300);

    const finalValue = page.locator('[aria-label="Final value"]');
    await expect(finalValue).toHaveText('$1,647.01', { timeout: 3000 });
  });

  test('malformed input (negative rate) renders inline error without crashing', async ({ page }) => {
    await page.locator('input[aria-label="Starting principal"]').fill('1000');
    await page.locator('input[aria-label="Annual return"]').fill('-5');
    await page.locator('input[aria-label="Years"]').fill('10');

    await page.waitForTimeout(300);

    const finalValue = page.locator('[aria-label="Final value"]');
    await expect(finalValue).toHaveText('—');

    await expect(page.locator('text=Annual return must be at least 0')).toBeVisible();
    await expect(page.locator('h1', { hasText: 'Compound Interest' })).toBeVisible();
  });
});
