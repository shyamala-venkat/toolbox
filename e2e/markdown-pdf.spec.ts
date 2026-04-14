import { test, expect } from '@playwright/test';

test.describe('Markdown to PDF', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/markdown-pdf');
    await expect(page.locator('h1', { hasText: 'Markdown to PDF' })).toBeVisible();
  });

  test('tool page loads with markdown input and preview panel', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Markdown input"]');
    await expect(input).toBeVisible();

    // Empty state should show placeholder text
    await expect(page.getByText('Start typing Markdown', { exact: false })).toBeVisible();
  });

  test('entering markdown renders preview with heading', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Markdown input"]');
    await input.fill('# Hello World');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Preview should contain an h1 with "Hello World"
    const preview = page.locator('.markdown-body');
    await expect(preview).toBeVisible({ timeout: 3000 });
    await expect(preview.locator('h1')).toContainText('Hello World');

    // Export PDF button should be enabled
    await expect(page.locator('button', { hasText: 'Export PDF' })).toBeEnabled();
  });

  test('character count updates as user types', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Markdown input"]');
    await input.fill('Hello');

    // Should show character count
    await expect(page.locator('text=5 chars')).toBeVisible({ timeout: 3000 });
  });
});
