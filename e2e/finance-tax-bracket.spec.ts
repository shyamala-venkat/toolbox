import { test, expect } from '@playwright/test';

/**
 * Tax Bracket Estimator E2E.
 *
 * Tax data flows through Tauri IPC (`get_finance_dataset`). The Vite dev
 * server runs the React renderer outside Tauri so the IPC call rejects;
 * the component renders the disclaimer banner + a "Could not load tax tables"
 * Banner with a Retry. Tests that exercise the real dataset are skipped in
 * the dev-server environment but the disclaimer assertion runs in BOTH
 * environments — that's the critical compliance gate.
 */

test.describe('Tax Bracket Estimator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/tax-bracket');
    await expect(
      page.locator('h1', { hasText: 'Tax Bracket Estimator' }),
    ).toBeVisible();
  });

  test('disclaimer banner is visibly rendered before any input or dataset load', async ({
    page,
  }) => {
    // CRITICAL gate: the disclaimer must be VISIBLE in every state, including
    // the initial loading state where the year placeholder ("TY—") is shown
    // until the dataset resolves.
    const banner = page
      .locator('[role="note"]')
      .filter({ hasText: /Estimate only/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Tax Year/i);
    await expect(banner).toContainText(/Not tax advice/i);
    await expect(banner).toContainText(/Federal only/i);
    await expect(banner).toContainText(/standard deduction/i);
  });

  test('disclaimer remains visible after dataset settles (load OR fail)', async ({
    page,
  }) => {
    // Wait for either the result block (loaded) or the danger Banner (failed).
    await page.waitForTimeout(2000);

    const incomeInput = page.locator('input[aria-label="Gross annual income"]');
    const retryAction = page.locator('button', { hasText: 'Retry' });

    const visibleSurface = (await incomeInput.isVisible())
      ? 'loaded'
      : (await retryAction.isVisible())
        ? 'failed'
        : 'none';

    expect(visibleSurface).not.toBe('none');

    // Disclaimer is the persistent compliance context — must be visible
    // regardless of which surface settled.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();
  });

  test('happy path: 75k single produces positive tax with effective + marginal rates', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const incomeInput = page.locator('input[aria-label="Gross annual income"]');
    if (!(await incomeInput.isVisible())) {
      test.skip(true, 'Tax dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    await incomeInput.fill('75000');
    await page.waitForTimeout(300);

    const taxResult = page.locator('[aria-label="Estimated federal tax"]');
    // Must not be the empty em-dash once a valid income is entered.
    await expect(taxResult).not.toHaveText('—', { timeout: 3000 });

    // Effective + marginal rates rendered with their formatted percent.
    const effective = page.locator('[aria-label="Effective rate"]');
    const marginal = page.locator('[aria-label="Marginal rate"]');
    await expect(effective).not.toHaveText('—');
    await expect(marginal).not.toHaveText('—');
    await expect(marginal).toContainText('%');

    // Disclaimer still visible after a successful calculation.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    // Copy button enabled.
    await expect(page.locator('button', { hasText: 'Copy' })).toBeEnabled();
  });

  test('malformed input shows inline error and disclaimer stays visible', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const incomeInput = page.locator('input[aria-label="Gross annual income"]');
    if (!(await incomeInput.isVisible())) {
      test.skip(true, 'Tax dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    await incomeInput.fill('abc');
    await page.waitForTimeout(300);

    await expect(
      page.locator('text=Gross income must be a number'),
    ).toBeVisible();

    const taxResult = page.locator('[aria-label="Estimated federal tax"]');
    await expect(taxResult).toHaveText('—');

    // Critical gate.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    // Tool header still mounted — error boundary did not engage.
    await expect(
      page.locator('h1', { hasText: 'Tax Bracket Estimator' }),
    ).toBeVisible();
  });
});
