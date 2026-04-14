import { test, expect } from '@playwright/test';

test.describe('Text Cleanup', () => {
  test('trim whitespace from lines', async ({ page }) => {
    await page.goto('/tools/text-cleanup');
    await expect(page.locator('h1', { hasText: 'Text Cleanup' })).toBeVisible();

    const input = page.locator('textarea[aria-label="Text to clean up"]');
    // Paste text with leading/trailing whitespace and empty lines
    await input.fill('  hello  \n\n  world  ');

    // Trim whitespace and remove empty lines should be on by default.
    // Ensure "Remove empty lines" is enabled via the Toggle's <label>/<button role="switch">
    const removeEmptyLabel = page.locator('label').filter({ hasText: 'Remove empty lines' });
    const removeEmptySwitch = removeEmptyLabel.locator('button[role="switch"]');
    const isChecked = await removeEmptySwitch.getAttribute('aria-checked');
    if (isChecked !== 'true') {
      await removeEmptySwitch.click();
    }

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Cleaned output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });

    const outputValue = await output.inputValue();
    // Should be trimmed lines with empty lines removed
    expect(outputValue).toBe('hello\nworld');
  });
});

test.describe('Text Case Converter', () => {
  test('paste "hello world" shows camelCase as "helloWorld"', async ({ page }) => {
    await page.goto('/tools/text-case');
    await expect(page.locator('h1', { hasText: 'Text Case' })).toBeVisible();

    const input = page.locator('textarea[aria-label="Text to convert"]');
    await input.fill('hello world');

    // Wait for debounce
    await page.waitForTimeout(200);

    // The camelCase row should show "helloWorld"
    // TextCase renders rows with a label (w-44) and a value (mono truncate text-sm)
    const camelRow = page.locator('div').filter({ hasText: 'camelCase' });
    const camelValue = camelRow.locator('.mono', { hasText: 'helloWorld' });
    await expect(camelValue.first()).toBeVisible();
  });
});
