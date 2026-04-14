import { test, expect } from '@playwright/test';

test.describe('Placeholder Image Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/placeholder-image');
    await expect(page.locator('h1', { hasText: 'Placeholder Image Generator' })).toBeVisible();
  });

  test('tool page loads with dimension inputs and canvas', async ({ page }) => {
    const widthInput = page.locator('input[aria-label="Image width in pixels"]');
    const heightInput = page.locator('input[aria-label="Image height in pixels"]');
    await expect(widthInput).toBeVisible();
    await expect(heightInput).toBeVisible();

    // Default values should produce a canvas preview
    await page.waitForTimeout(300);
    const canvas = page.locator('canvas[aria-label*="Placeholder image preview"]');
    await expect(canvas).toBeVisible({ timeout: 3000 });
  });

  test('changing dimensions updates the canvas', async ({ page }) => {
    const widthInput = page.locator('input[aria-label="Image width in pixels"]');
    const heightInput = page.locator('input[aria-label="Image height in pixels"]');

    await widthInput.fill('400');
    await heightInput.fill('300');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Canvas should be visible with updated dimensions
    const canvas = page.locator('canvas[aria-label="Placeholder image preview 400x300"]');
    await expect(canvas).toBeVisible({ timeout: 3000 });

    // Download button should be visible
    await expect(page.locator('button', { hasText: 'Download PNG' })).toBeVisible();
  });
});
