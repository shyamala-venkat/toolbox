import { test, expect } from '@playwright/test';

test.describe('Base64 Encoder/Decoder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/base64');
    await expect(page.locator('h1', { hasText: 'Base64' })).toBeVisible();
  });

  test('tool page loads', async ({ page }) => {
    // The encode direction should be active by default
    const encodeRadio = page.locator('button[role="radio"][aria-checked="true"]', { hasText: 'encode' });
    await expect(encodeRadio).toBeVisible();
  });

  test('encode "Hello World" produces "SGVsbG8gV29ybGQ="', async ({ page }) => {
    // Ensure we're in encode mode (default)
    const input = page.locator('textarea[aria-label="Plain text input"]');
    await input.fill('Hello World');

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Base64 output"]');
    await expect(output).toHaveValue('SGVsbG8gV29ybGQ=', { timeout: 3000 });
  });

  test('decode "SGVsbG8gV29ybGQ=" produces "Hello World"', async ({ page }) => {
    // Switch to decode mode
    const decodeButton = page.locator('button[role="radio"]', { hasText: 'decode' });
    await decodeButton.click();

    const input = page.locator('textarea[aria-label="Base64 input"]');
    await input.fill('SGVsbG8gV29ybGQ=');

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Decoded text output"]');
    await expect(output).toHaveValue('Hello World', { timeout: 3000 });
  });

  test('invalid base64 in decode mode shows error', async ({ page }) => {
    // Switch to decode mode
    const decodeButton = page.locator('button[role="radio"]', { hasText: 'decode' });
    await decodeButton.click();

    const input = page.locator('textarea[aria-label="Base64 input"]');
    await input.fill('!!!not-valid-base64!!!');

    // Wait for the error alert to appear
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 3000 });
    await expect(errorAlert).toContainText('not valid Base64');
  });
});
