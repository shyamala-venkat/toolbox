import { test, expect } from '@playwright/test';

test.describe('URL Encoder/Decoder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/url-encoder');
    await expect(page.locator('h1', { hasText: 'URL Encoder' })).toBeVisible();
  });

  test('encode "hello world" produces "hello%20world" in component mode', async ({ page }) => {
    // Default is encode + component mode
    const input = page.locator('textarea[aria-label="Plain input"]');
    await input.fill('hello world');

    const output = page.locator('textarea[aria-label="Encoded output"]');
    await expect(output).toHaveValue('hello%20world', { timeout: 3000 });
  });

  test('decode "hello%20world" produces "hello world"', async ({ page }) => {
    // Switch to decode mode
    const decodeButton = page.locator('button[role="radio"]', { hasText: 'decode' });
    await decodeButton.click();

    const input = page.locator('textarea[aria-label="Encoded input"]');
    await input.fill('hello%20world');

    const output = page.locator('textarea[aria-label="Decoded output"]');
    await expect(output).toHaveValue('hello world', { timeout: 3000 });
  });
});
