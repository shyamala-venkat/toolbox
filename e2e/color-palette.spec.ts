import { test, expect } from '@playwright/test';

test.describe('Color Palette Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/color-palette');
    await expect(page.locator('h1', { hasText: 'Color Palette Generator' })).toBeVisible();
  });

  test('tool page loads with hex color input', async ({ page }) => {
    const hexInput = page.locator('input[aria-label="Hex color input"]');
    await expect(hexInput).toBeVisible();
  });

  test('entering a hex color generates palette swatches', async ({ page }) => {
    const hexInput = page.locator('input[aria-label="Hex color input"]');
    await hexInput.fill('#FF5733');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Should show palette type headings
    await expect(page.getByRole('heading', { name: 'Complementary', exact: true })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('heading', { name: 'Analogous' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Triadic' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monochromatic' })).toBeVisible();

    // Swatch buttons should be present (each palette has 5 swatches)
    const swatches = page.locator('button[aria-label^="Copy #"]');
    const count = await swatches.count();
    expect(count).toBeGreaterThanOrEqual(20); // 5 palette types x 5 swatches = 25
  });

  test('invalid hex shows error message', async ({ page }) => {
    const hexInput = page.locator('input[aria-label="Hex color input"]');
    await hexInput.fill('#GGGGGG');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Should show "Invalid hex color" error
    await expect(page.locator('text=Invalid hex color')).toBeVisible({ timeout: 3000 });
  });
});
