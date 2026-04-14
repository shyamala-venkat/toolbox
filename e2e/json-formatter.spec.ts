import { test, expect } from '@playwright/test';

test.describe('JSON Formatter tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();
  });

  test('tool page loads', async ({ page }) => {
    // Input textarea should be present
    const input = page.locator('textarea[aria-label="JSON input"]');
    await expect(input).toBeVisible();
  });

  test('paste valid JSON shows formatted output', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"b":2,"a":1}');

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });

    const outputValue = await output.inputValue();
    // Should be pretty-printed with 2-space indent by default
    expect(outputValue).toContain('"b": 2');
    expect(outputValue).toContain('"a": 1');
    // Should be multi-line
    expect(outputValue.split('\n').length).toBeGreaterThan(1);
  });

  test('paste invalid JSON shows parse error', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{not valid json}');

    // Wait for debounce and error to appear
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 3000 });
    await expect(errorAlert).toContainText('Parse error');
  });

  test('toggle Sort keys produces alphabetically sorted output', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"zebra":1,"alpha":2,"mango":3}');

    // Enable sort keys — Toggle renders a <label> wrapping a <button role="switch">
    const sortKeysLabel = page.locator('label').filter({ hasText: 'Sort keys' });
    await sortKeysLabel.locator('button[role="switch"]').click();

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });

    const outputValue = await output.inputValue();
    // Keys should be in alphabetical order: alpha, mango, zebra
    const alphaIdx = outputValue.indexOf('"alpha"');
    const mangoIdx = outputValue.indexOf('"mango"');
    const zebraIdx = outputValue.indexOf('"zebra"');
    expect(alphaIdx).toBeLessThan(mangoIdx);
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  test('toggle Minify produces single-line output', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"hello": "world", "foo": "bar"}');

    // Enable minify — Toggle renders a <label> wrapping a <button role="switch">
    const minifyLabel = page.locator('label').filter({ hasText: 'Minify' });
    await minifyLabel.locator('button[role="switch"]').click();

    // Wait for debounce
    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });

    const outputValue = await output.inputValue();
    // Minified output should be a single line
    expect(outputValue.split('\n').length).toBe(1);
    expect(outputValue).toContain('"hello":"world"');
  });

  test('switch to Tree view tab shows tree view container', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"hello": "world"}');

    // Wait for debounce
    await page.waitForTimeout(300);

    // Click the Tree tab
    const treeTab = page.locator('button[role="tab"]', { hasText: 'Tree' });
    await treeTab.click();

    // Tree View header should appear
    await expect(page.locator('text=Tree View')).toBeVisible();
  });

  test('clear button empties input', async ({ page }) => {
    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"hello": "world"}');

    // Click clear button
    const clearButton = page.locator('button', { hasText: 'Clear' });
    await clearButton.click();

    await expect(input).toHaveValue('');
  });
});
