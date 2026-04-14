import { test, expect } from '@playwright/test';

test.describe('Aspect Ratio Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/aspect-ratio');
    await expect(page.locator('h1', { hasText: 'Aspect Ratio Calculator' })).toBeVisible();
  });

  test('tool page loads with width and height inputs', async ({ page }) => {
    const widthInput = page.locator('input[aria-label="Width in pixels"]');
    const heightInput = page.locator('input[aria-label="Height in pixels"]');
    await expect(widthInput).toBeVisible();
    await expect(heightInput).toBeVisible();
  });

  test('entering 1920x1080 shows 16:9 ratio', async ({ page }) => {
    const widthInput = page.locator('input[aria-label="Width in pixels"]');
    const heightInput = page.locator('input[aria-label="Height in pixels"]');
    await widthInput.fill('1920');
    await heightInput.fill('1080');

    // Wait for debounce
    await page.waitForTimeout(300);

    // The result should show 16:9 in the aria-label
    const result = page.locator('[aria-label="Aspect ratio preview 16:9"]');
    await expect(result).toBeVisible({ timeout: 3000 });
  });

  test('Calculate Ratio and Find Dimension tabs are present', async ({ page }) => {
    const calculateTab = page.locator('button[role="tab"]', { hasText: 'Calculate Ratio' });
    const findDimTab = page.locator('button[role="tab"]', { hasText: 'Find Dimension' });
    await expect(calculateTab).toBeVisible();
    await expect(findDimTab).toBeVisible();
  });
});
