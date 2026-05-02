import { test, expect } from '@playwright/test';

/**
 * Inline tab-pattern history flows.
 *
 * (The right-side drawer was replaced with an inline `Editor / Recent (N)`
 * tab pattern after user feedback. Tests cover the new pattern.)
 *
 * Note on the test environment: Playwright runs against the Vite dev server
 * (no Tauri runtime), so the history IPC commands always fail. The Recent
 * tab is designed to handle that gracefully — when the user opens it, the
 * fetch errors and the unavailable banner renders. We test what's reliably
 * observable in that environment:
 *
 *   - Tabs render on eligible tools
 *   - Tabs are ABSENT on sensitive tools
 *   - Tabs are ABSENT on non-eligible tools (file-input, form, visual)
 *   - Editor tab is the default and shows the tool's content
 *   - Clicking the Recent tab shows the history list (or unavailable banner)
 *   - Tool functionality is unaffected when the tabs are present
 */
test.describe('Editor / Recent tabs', () => {
  test('tabs render on an eligible tool (json-formatter)', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const tablist = page.locator('[role="tablist"][aria-label="Editor or recent runs"]');
    await expect(tablist).toBeVisible();

    const editorTab = tablist.locator('[role="tab"]', { hasText: 'Editor' });
    const recentTab = tablist.locator('[role="tab"]', { hasText: 'Recent' });
    await expect(editorTab).toBeVisible();
    await expect(recentTab).toBeVisible();
  });

  test('tabs are NOT rendered on a sensitive tool (password-gen)', async ({ page }) => {
    await page.goto('/tools/password-gen');
    await expect(page.locator('h1', { hasText: 'Password Generator' })).toBeVisible();

    const tablist = page.locator('[role="tablist"][aria-label="Editor or recent runs"]');
    await expect(tablist).toHaveCount(0);
  });

  test('tabs are NOT rendered on a file-input tool (pdf-merge, historyEligible:false)', async ({
    page,
  }) => {
    await page.goto('/tools/pdf-merge');
    await expect(page.locator('h1', { hasText: 'PDF Merge' })).toBeVisible();

    const tablist = page.locator('[role="tablist"][aria-label="Editor or recent runs"]');
    await expect(tablist).toHaveCount(0);
  });

  test('Editor tab is selected by default and shows the tool content', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const editorTab = page.locator('[role="tab"]', { hasText: 'Editor' });
    await expect(editorTab).toHaveAttribute('aria-selected', 'true');

    // Tool's input is visible when the Editor tab is active.
    const input = page.locator('textarea[aria-label="JSON input"]');
    await expect(input).toBeVisible();
  });

  test('clicking Recent tab switches focus and renders the list (or unavailable banner)', async ({
    page,
  }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const recentTab = page.locator('[role="tab"]', { hasText: 'Recent' });
    await recentTab.click();

    await expect(recentTab).toHaveAttribute('aria-selected', 'true');

    // Either the unavailable banner appears (Vite-dev: no Tauri IPC) or the
    // empty state renders. Either is acceptable; both indicate the panel
    // mounted correctly.
    const unavailable = page.locator('text=History temporarily unavailable');
    const empty = page.locator('text=Recent runs of');
    await expect.poll(async () => {
      return (await unavailable.count()) + (await empty.count());
    }, { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('Recent tab unavailable state has a Retry button (IPC-down branch)', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    await page.locator('[role="tab"]', { hasText: 'Recent' }).click();

    // In the dev-server environment the Tauri IPC isn't wired, so listHistory
    // rejects and the panel renders "History temporarily unavailable" + Retry.
    // This test pins that contract — if a future change swallows the error
    // and shows a perpetual skeleton, the regression is loud.
    await expect(page.locator('text=History temporarily unavailable')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('button', { hasText: 'Retry' })).toBeVisible();
  });

  test('switching back to Editor tab restores the tool input', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"x":1}');

    // Switch to Recent and back to Editor — the input must persist (the
    // Editor tabpanel is hidden, not unmounted).
    await page.locator('[role="tab"]', { hasText: 'Recent' }).click();
    await page.locator('[role="tab"]', { hasText: 'Editor' }).click();

    await expect(input).toHaveValue('{"x":1}');
  });

  test('tab mount does not break the JSON Formatter happy path', async ({ page }) => {
    // Regression guard: the tabs wrap the tool content. If layout, focus,
    // or event-bubbling regressions sneak in, the simplest detection is
    // "does the tool still produce output for valid input?"
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"x":1}');

    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });
    expect(await output.inputValue()).toContain('"x": 1');
  });
});
