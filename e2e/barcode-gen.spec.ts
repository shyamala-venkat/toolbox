import { test, expect } from '@playwright/test';

test.describe('Barcode Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/barcode-gen');
    await expect(page.locator('h1', { hasText: 'Barcode Generator' })).toBeVisible();
  });

  test('tool page loads with value input and settings', async ({ page }) => {
    const input = page.locator('input[aria-label="Barcode value"]');
    await expect(input).toBeVisible();

    // Format selector should be visible
    const formatSelect = page.locator('[aria-label="Barcode format"]');
    await expect(formatSelect).toBeVisible();
  });

  test('entering a value renders an SVG barcode', async ({ page }) => {
    const input = page.locator('input[aria-label="Barcode value"]');
    await input.fill('12345');

    // Wait for debounce
    await page.waitForTimeout(400);

    // SVG barcode should be rendered (JsBarcode populates the svg element)
    const svg = page.locator('svg');
    // The svg should have child elements (bars)
    await expect(svg.locator('rect').first()).toBeVisible({ timeout: 3000 });

    // Download buttons should appear
    await expect(page.locator('button', { hasText: 'Download PNG' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Download SVG' })).toBeVisible();
  });

  test('empty input shows placeholder text', async ({ page }) => {
    await expect(page.locator('text=Enter a value above to generate a barcode')).toBeVisible();
  });
});
