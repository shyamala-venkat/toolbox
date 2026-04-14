import { test, expect } from '@playwright/test';

test.describe('Image Crop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/image-crop');
    await expect(page.locator('h1', { hasText: 'Image Crop' })).toBeVisible();
  });

  test('tool page loads with file upload area', async ({ page }) => {
    // FileDropZone should be visible with the crop label
    const dropZone = page.locator('[role="button"][aria-label="Drop an image to crop"]');
    await expect(dropZone).toBeVisible();
  });

  test('drop zone shows supported format description', async ({ page }) => {
    await expect(page.locator('text=Supports PNG, JPEG, WebP, BMP, GIF')).toBeVisible();
  });
});
