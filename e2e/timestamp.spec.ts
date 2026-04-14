import { test, expect } from '@playwright/test';

test.describe('Timestamp Converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/timestamp-converter');
    await expect(page.locator('h1', { hasText: 'Timestamp Converter' })).toBeVisible();
  });

  test('type "0" shows January 1, 1970 (Unix epoch)', async ({ page }) => {
    const input = page.locator('input[placeholder*="1712592000"]');
    await input.fill('0');

    // Wait for debounce and results to appear
    await expect(page.locator('text=Conversions')).toBeVisible({ timeout: 3000 });

    // The ISO 8601 row should show 1970-01-01
    const isoRow = page.locator('code', { hasText: '1970-01-01' });
    await expect(isoRow.first()).toBeVisible();

    // Unix seconds row should show 0
    const unixRow = page.locator('code', { hasText: /^0$/ });
    await expect(unixRow.first()).toBeVisible();
  });

  test('type "1700000000" shows a date in 2023', async ({ page }) => {
    const input = page.locator('input[placeholder*="1712592000"]');
    await input.fill('1700000000');

    // Wait for results
    await expect(page.locator('text=Conversions')).toBeVisible({ timeout: 3000 });

    // The ISO row should show 2023
    const isoRow = page.locator('code', { hasText: '2023' });
    await expect(isoRow.first()).toBeVisible();
  });

  test('type "invalid" shows error', async ({ page }) => {
    const input = page.locator('input[placeholder*="1712592000"]');
    await input.fill('invalid');

    // Wait for debounce
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 3000 });
    await expect(errorAlert).toContainText('Could not parse');
  });
});
