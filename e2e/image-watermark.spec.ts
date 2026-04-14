import { test, expect } from '@playwright/test';

test.describe('Image Watermark', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/image-watermark');
    await expect(page.locator('h1', { hasText: 'Image Watermark' })).toBeVisible();
  });

  test('tool page loads with file upload area', async ({ page }) => {
    // FileDropZone should be visible with the watermark label
    const dropZone = page.locator('[role="button"][aria-label="Drop an image to watermark"]');
    await expect(dropZone).toBeVisible();
  });

  test('drop zone shows supported format description', async ({ page }) => {
    await expect(page.locator('text=Supports PNG, JPEG, WebP, BMP, GIF')).toBeVisible();
  });
});
