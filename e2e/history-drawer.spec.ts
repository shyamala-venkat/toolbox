import { test, expect } from '@playwright/test';

/**
 * Per-tool "Recent runs" drawer flows (PR-B).
 *
 * Note on the test environment: Playwright runs against the Vite dev server
 * (no Tauri runtime), so the history IPC commands always fail. The drawer
 * is designed to handle that gracefully — it renders, then surfaces an
 * "unavailable" banner once it tries to fetch and the IPC errors. We test
 * what's reliably observable in that environment:
 *
 *   - Drawer mounts on eligible tools (json-formatter)
 *   - Drawer is ABSENT on sensitive tools (password-gen)
 *   - Drawer is ABSENT on file-input tools (pdf-merge, historyEligible:false)
 *   - Rail-to-expanded toggle works (click + Cmd+Shift+H shortcut)
 *   - Esc collapses the expanded drawer
 *   - The unavailable banner appears once an IPC fetch errors out
 */
test.describe('History drawer', () => {
  test('drawer rail renders on an eligible tool (json-formatter)', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const drawer = page.locator('aside[aria-label="Recent runs for JSON Formatter"]');
    await expect(drawer).toBeVisible();

    // Default state is collapsed → the rail button is the only thing inside.
    const railButton = drawer.locator('button[aria-label*="Expand recent runs"]');
    await expect(railButton).toBeVisible();
  });

  test('drawer is NOT rendered on a sensitive tool (password-gen)', async ({ page }) => {
    await page.goto('/tools/password-gen');
    await expect(page.locator('h1', { hasText: 'Password Generator' })).toBeVisible();

    // No drawer at all — sensitiveContent: true → ToolPage skips the Drawer.
    const drawer = page.locator('aside[aria-label*="Recent runs"]');
    await expect(drawer).toHaveCount(0);
  });

  test('drawer is NOT rendered on a file-input tool (pdf-merge, historyEligible:false)', async ({
    page,
  }) => {
    await page.goto('/tools/pdf-merge');
    await expect(page.locator('h1', { hasText: 'PDF Merge' })).toBeVisible();

    const drawer = page.locator('aside[aria-label*="Recent runs"]');
    await expect(drawer).toHaveCount(0);
  });

  test('clicking the rail expands the drawer and shows the Recent runs header', async ({
    page,
  }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const drawer = page.locator('aside[aria-label="Recent runs for JSON Formatter"]');
    await expect(drawer).toBeVisible();

    const railButton = drawer.locator('button[aria-label*="Expand recent runs"]');
    await railButton.click();

    // Expanded header includes the "Recent runs" label text.
    await expect(drawer.locator('text=Recent runs')).toBeVisible({ timeout: 3000 });

    // The collapse-drawer button is present in the expanded header.
    const collapseButton = drawer.locator('button[aria-label="Collapse drawer"]');
    await expect(collapseButton).toBeVisible();
  });

  test('Cmd/Ctrl+Shift+H toggles the drawer between rail and expanded', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const drawer = page.locator('aside[aria-label="Recent runs for JSON Formatter"]');
    await expect(drawer).toBeVisible();

    // Move focus off the input so the shortcut isn't blocked by the editable
    // target guard inside useKeyboardShortcut.
    await page.locator('h1').click();

    // Press Ctrl+Shift+H — useKeyboardShortcut treats `mod` as either Meta
    // (mac) or Control (everywhere else); Playwright on chromium fires the
    // `Control` modifier, which the hook accepts.
    await page.keyboard.press('Control+Shift+H');

    // Expanded header text appears.
    await expect(drawer.locator('text=Recent runs')).toBeVisible({ timeout: 3000 });

    // Press again to collapse — the rail button reappears.
    await page.keyboard.press('Control+Shift+H');
    await expect(drawer.locator('button[aria-label*="Expand recent runs"]')).toBeVisible({
      timeout: 3000,
    });
  });

  test('Esc collapses the expanded drawer', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const drawer = page.locator('aside[aria-label="Recent runs for JSON Formatter"]');
    const railButton = drawer.locator('button[aria-label*="Expand recent runs"]');
    await railButton.click();
    await expect(drawer.locator('text=Recent runs')).toBeVisible({ timeout: 3000 });

    // Move focus off any input/textarea (Esc should still work because the
    // Drawer's Esc handler is window-level, not target-gated).
    await page.locator('h1').click();
    await page.keyboard.press('Escape');

    await expect(drawer.locator('button[aria-label*="Expand recent runs"]')).toBeVisible({
      timeout: 3000,
    });
  });

  test('expanded drawer renders the unavailable banner when IPC is missing', async ({ page }) => {
    // In the dev-server environment the Tauri IPC isn't wired, so listHistory
    // throws and the drawer falls into its "history unavailable" branch.
    // This test pins that contract — if a future change swallows the error
    // and shows a perpetual skeleton, the regression is loud.
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const drawer = page.locator('aside[aria-label="Recent runs for JSON Formatter"]');
    await drawer.locator('button[aria-label*="Expand recent runs"]').click();

    // The banner copy is "History temporarily unavailable" with a Retry button.
    await expect(drawer.locator('text=History temporarily unavailable')).toBeVisible({
      timeout: 3000,
    });
    await expect(drawer.locator('button', { hasText: 'Retry' })).toBeVisible();
  });

  test('drawer mount does not break the JSON Formatter happy path', async ({ page }) => {
    // Regression guard: the drawer is rendered alongside the tool content.
    // If layout, focus, or event-bubbling regressions sneak in, the simplest
    // detection is "does the tool still produce output for valid input?"
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const input = page.locator('textarea[aria-label="JSON input"]');
    await input.fill('{"x":1}');

    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });
    expect(await output.inputValue()).toContain('"x": 1');
  });
});
