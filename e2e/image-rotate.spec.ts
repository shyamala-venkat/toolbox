import { test, expect } from '@playwright/test';

test.describe('Image Rotate & Flip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/image-rotate');
    await expect(page.locator('h1', { hasText: 'Image Rotate & Flip' })).toBeVisible();
  });

  test('tool page loads with file upload area', async ({ page }) => {
    // FileDropZone should be visible with the transform label
    const dropZone = page.locator('[role="button"][aria-label="Drop an image to transform"]');
    await expect(dropZone).toBeVisible();
  });

  test('drop zone shows supported format description', async ({ page }) => {
    await expect(page.locator('text=Supports PNG, JPEG, WebP, BMP, GIF')).toBeVisible();
  });
});
