import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Settings → History panel flows (PR-A wired UI; covered here as part of
 * PR-B.3's parity work because no Playwright spec existed for it).
 *
 * Like the drawer spec, this runs in the dev-server environment where IPC
 * fails. The store falls back to defaults, so the UI is driven entirely by
 * client state — exactly the path users hit when the Tauri runtime is
 * absent or the keychain is locked. We exercise:
 *
 *   - History section is visible (heading + retention radiogroup)
 *   - Retention "30 days" is clickable
 *   - "Clear all history" two-step confirm dance (label flips to "Clear all"
 *     after first click, Cancel resets back to "Clear")
 *   - Storage usage line is rendered
 *   - Pause toggle is rendered
 *
 * All locators are scoped to the History <section> element so they don't
 * collide with similarly-named buttons elsewhere on the Settings page
 * (e.g. the "Clear" button under the Recents section).
 */

/** Find the History section by its heading. Scoped to a <section> ancestor
 *  so child locators don't bleed into other Settings sections. */
const historySection = (page: Page): Locator =>
  page.locator('section').filter({
    has: page.locator('h2', { hasText: 'History' }),
  });

test.describe('History settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  });

  test('History section is visible', async ({ page }) => {
    const section = historySection(page);
    await expect(section).toBeVisible();
    await expect(section.locator('h2', { hasText: 'History' })).toBeVisible();
    const retention = section.locator('[role="radiogroup"][aria-label="History retention"]');
    await expect(retention).toBeVisible();
  });

  test('clicking "30 days" is wired to the retention radio (no exception thrown)', async ({
    page,
  }) => {
    const section = historySection(page);
    const retention = section.locator('[role="radiogroup"][aria-label="History retention"]');
    await expect(retention).toBeVisible();

    const thirtyDayLabel = retention.locator('label').filter({ hasText: '30 days' });
    await expect(thirtyDayLabel).toBeVisible();
    await thirtyDayLabel.click();
    // Note: the radio's `checked` state is driven by the IPC round-trip
    // (`set_history_retention` → store update). In the dev-server env this
    // IPC errors out and the optimistic update is rolled back, so we can't
    // assert `toBeChecked()` here. The click itself completing without
    // throwing is the regression signal we want.
  });

  test('Storage usage label is rendered inside the History section', async ({ page }) => {
    const section = historySection(page);
    // The exact-match avoids colliding with the diagnostic line
    // "Storage usage unavailable." that renders below the heading when the
    // stats IPC has errored out.
    await expect(section.getByText('Storage usage', { exact: true })).toBeVisible();
  });

  test('Clear all history shows the two-step confirm and Cancel resets it', async ({ page }) => {
    const section = historySection(page);

    // Initial state: button labelled "Clear" (single-step trigger).
    const initialClear = section.locator('button', { hasText: /^Clear$/ });
    await expect(initialClear).toBeVisible();
    await initialClear.click();

    // Destructive variant takes over: "Clear all" + Cancel + warning copy.
    const destructive = section.locator('button', { hasText: 'Clear all' });
    await expect(destructive).toBeVisible({ timeout: 3000 });
    const cancel = section.locator('button', { hasText: 'Cancel' });
    await expect(cancel).toBeVisible();
    await expect(
      section.locator('text=This will permanently delete all history. Cannot be undone.'),
    ).toBeVisible();

    // Cancel resets the UI back to the original Clear button.
    await cancel.click();
    await expect(section.locator('button', { hasText: /^Clear$/ })).toBeVisible({
      timeout: 3000,
    });
  });

  test('Pause history globally toggle is rendered', async ({ page }) => {
    const section = historySection(page);
    const pauseLabel = section.locator('label').filter({ hasText: 'Pause history globally' });
    await expect(pauseLabel).toBeVisible();
    await expect(pauseLabel.locator('button[role="switch"]')).toBeVisible();
  });
});
