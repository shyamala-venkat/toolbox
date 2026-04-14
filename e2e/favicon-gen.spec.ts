import { test, expect } from '@playwright/test';

test.describe('Favicon Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/favicon-gen');
    await expect(page.locator('h1', { hasText: 'Favicon Generator' })).toBeVisible();
  });

  test('tool page loads with text input and mode tabs', async ({ page }) => {
    const textInput = page.locator('input[aria-label="Favicon text or emoji"]');
    await expect(textInput).toBeVisible();

    // Mode tabs should be visible
    const textTab = page.locator('button[role="tab"]', { hasText: 'Text / Emoji' });
    const imageTab = page.locator('button[role="tab"]', { hasText: 'Upload Image' });
    await expect(textTab).toBeVisible();
    await expect(imageTab).toBeVisible();
  });

  test('entering text generates favicon previews', async ({ page }) => {
    const textInput = page.locator('input[aria-label="Favicon text or emoji"]');

    // Clear the default and type a new character
    await textInput.fill('B');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Preview images should appear (rendered as img elements with data URLs)
    const previewImages = page.locator('img[src^="data:image"]');
    await expect(previewImages.first()).toBeVisible({ timeout: 5000 });
  });
});
