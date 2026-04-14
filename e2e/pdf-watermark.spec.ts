import { test, expect } from '@playwright/test';

test.describe('PDF Watermark', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/pdf-watermark');
    await expect(page.locator('h1', { hasText: 'PDF Watermark' })).toBeVisible();
  });

  test('tool page loads with file upload area', async ({ page }) => {
    // FileDropZone should be visible
    const dropZone = page.locator('[role="button"][aria-label="Drop a PDF here or click to browse"]');
    await expect(dropZone).toBeVisible();
  });

  test('empty state message is shown when no PDF loaded', async ({ page }) => {
    await expect(page.locator('text=No PDF loaded')).toBeVisible();
    await expect(page.locator('text=Drop a PDF above to add a text watermark')).toBeVisible();
  });
});
