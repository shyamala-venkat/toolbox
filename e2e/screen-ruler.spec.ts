import { test, expect } from '@playwright/test';

test.describe('Screen Ruler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/screen-ruler');
    await expect(page.locator('h1', { hasText: 'Screen Ruler' })).toBeVisible();
  });

  test('tool page loads with measurement readout and canvas', async ({ page }) => {
    // Measurement labels should be visible
    await expect(page.locator('text=Width')).toBeVisible();
    await expect(page.locator('text=Height')).toBeVisible();
    await expect(page.locator('text=Diagonal')).toBeVisible();

    // Canvas area should be visible
    const canvas = page.locator('[role="application"][aria-label*="Pixel measurement canvas"]');
    await expect(canvas).toBeVisible();
  });

  test('drag handles are visible and show coordinates', async ({ page }) => {
    // Start and end handles should be visible as sliders
    const startHandle = page.locator('[role="slider"][aria-label="Start point"]');
    const endHandle = page.locator('[role="slider"][aria-label="End point"]');
    await expect(startHandle).toBeVisible();
    await expect(endHandle).toBeVisible();

    // Reset button should be visible
    await expect(page.locator('button', { hasText: 'Reset' })).toBeVisible();

    // Coordinate labels A and B should be visible
    await expect(page.locator('text=/A \\(/')).toBeVisible();
    await expect(page.locator('text=/B \\(/')).toBeVisible();
  });
});
