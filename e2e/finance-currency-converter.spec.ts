import { test, expect } from '@playwright/test';

/**
 * Currency Converter E2E.
 *
 * The Vite dev server runs the React renderer outside the Tauri runtime, so
 * IPC calls to `get_finance_dataset` / `import_fx_snapshot` resolve as
 * rejected promises. The component handles that gracefully — failed dataset
 * load surfaces a "Could not load currency rates" danger banner with a Retry
 * action — which is itself a valid testable surface for the empty / error
 * branches that don't need a live dataset.
 *
 * Tests that DO require a live dataset (happy path conversion, swap, picker
 * change, paste flows) wait for either the dataset to resolve or the load
 * error banner to appear, then dispatch accordingly. In the non-Tauri dev
 * server the dataset path will not resolve, so we validate the renderer
 * boots, the failure UI is correct, and the page does not crash. The
 * Rust-side validator is covered by the cargo test suite.
 */

test.describe('Currency Converter tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/currency-converter');
    await expect(
      page.locator('h1', { hasText: 'Currency Converter' }),
    ).toBeVisible();
  });

  test('renders without crashing and shows a primary status surface', async ({
    page,
  }) => {
    // Wait for either the loaded UI (banner with Refresh rates ↗) or the
    // load-failure UI (danger banner with Retry action). Both are valid in
    // their respective environments; both prove the component mounted.
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    const retryAction = page.locator('button', { hasText: 'Retry' });

    const visibleSurface = (await refreshAction.isVisible())
      ? 'refresh'
      : (await retryAction.isVisible())
        ? 'retry'
        : 'none';

    expect(visibleSurface).not.toBe('none');

    // The page header is still mounted — error boundary did not engage.
    await expect(
      page.locator('h1', { hasText: 'Currency Converter' }),
    ).toBeVisible();
  });

  test('happy path: amount produces a result OR retry surface stays', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    const datasetLoaded = await refreshAction.isVisible();

    if (!datasetLoaded) {
      // Non-Tauri environment — only the failure surface is reachable.
      await expect(page.locator('button', { hasText: 'Retry' })).toBeVisible();
      return;
    }

    const amount = page.locator('input[aria-label="Amount"]');
    await expect(amount).toBeVisible();

    await amount.fill('100');
    await page.waitForTimeout(300);

    const result = page.locator('[aria-label="Converted amount"]');
    // Result must not be the empty em-dash placeholder once an amount is
    // entered with a valid pair.
    await expect(result).not.toHaveText('—');

    // Copy button is enabled with content.
    const copyBtn = page.locator('button', { hasText: 'Copy' });
    await expect(copyBtn).toBeEnabled();
  });

  test('swap button swaps from/to selections', async ({ page }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    if (!(await refreshAction.isVisible())) {
      test.skip(true, 'Dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    const fromSelect = page.locator('select[aria-label="From currency"]');
    const toSelect = page.locator('select[aria-label="To currency"]');
    const swap = page.locator('button[aria-label="Swap currencies"]');

    const beforeFrom = await fromSelect.inputValue();
    const beforeTo = await toSelect.inputValue();

    await swap.click();
    await page.waitForTimeout(150);

    const afterFrom = await fromSelect.inputValue();
    const afterTo = await toSelect.inputValue();

    expect(afterFrom).toBe(beforeTo);
    expect(afterTo).toBe(beforeFrom);
  });

  test('changing target currency updates the result formatting', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    if (!(await refreshAction.isVisible())) {
      test.skip(true, 'Dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    const amount = page.locator('input[aria-label="Amount"]');
    const toSelect = page.locator('select[aria-label="To currency"]');

    await amount.fill('100');
    await toSelect.selectOption('GBP');
    await page.waitForTimeout(300);

    const result = page.locator('[aria-label="Converted amount"]');
    await expect(result).not.toHaveText('—');
    // Result should contain a £ glyph for GBP, regardless of locale fallback.
    await expect(result).toContainText('£');
  });

  test('empty amount keeps result as em-dash and disables copy', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    if (!(await refreshAction.isVisible())) {
      test.skip(true, 'Dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    const amount = page.locator('input[aria-label="Amount"]');
    await amount.fill('');
    await page.waitForTimeout(300);

    const result = page.locator('[aria-label="Converted amount"]');
    await expect(result).toHaveText('—');

    const copyBtn = page.locator('button', { hasText: 'Copy' });
    await expect(copyBtn).toBeDisabled();
  });

  test('update rates: invalid JSON shows inline error, banner unchanged', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    if (!(await refreshAction.isVisible())) {
      test.skip(true, 'Dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    // Capture banner title before update.
    const banner = page.locator('[role="status"], [role="alert"]').first();
    const titleBefore = await banner.textContent();

    const disclosure = page.locator('button', {
      hasText: 'Update rates manually',
    });
    await disclosure.click();

    const textarea = page.locator('textarea[aria-label="Snapshot JSON"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('not json');

    const apply = page.locator('button', { hasText: 'Validate & apply' });
    await apply.click();
    await page.waitForTimeout(500);

    // Inline error rendered (whether wrapped from Rust or generic fallback).
    await expect(page.locator('text=/Snapshot rejected/i')).toBeVisible();

    // Banner header text is unchanged.
    const titleAfter = await banner.textContent();
    expect(titleAfter).toBe(titleBefore);
  });

  test('update rates: non-USD base is rejected, banner unchanged', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const refreshAction = page.locator('button', {
      hasText: 'Refresh rates',
    });
    if (!(await refreshAction.isVisible())) {
      test.skip(true, 'Dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    const banner = page.locator('[role="status"], [role="alert"]').first();
    const titleBefore = await banner.textContent();

    const disclosure = page.locator('button', {
      hasText: 'Update rates manually',
    });
    await disclosure.click();

    const textarea = page.locator('textarea[aria-label="Snapshot JSON"]');
    await textarea.fill(
      '{"asOf":"2026-04-30","base":"EUR","rates":{"USD":1.08}}',
    );

    const apply = page.locator('button', { hasText: 'Validate & apply' });
    await apply.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=/Snapshot rejected/i')).toBeVisible();

    const titleAfter = await banner.textContent();
    expect(titleAfter).toBe(titleBefore);
  });
});
