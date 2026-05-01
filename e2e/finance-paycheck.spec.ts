import { test, expect } from '@playwright/test';

/**
 * Paycheck Calculator E2E.
 *
 * Like the Tax Bracket Estimator, this tool depends on the bundled `tax-fed`
 * dataset via Tauri IPC. In the Vite dev server the IPC call fails and the
 * tool surfaces a danger Banner + Retry. The disclaimer banner must remain
 * visible in every state — that's the critical compliance gate.
 */

test.describe('Paycheck Calculator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/paycheck');
    await expect(
      page.locator('h1', { hasText: 'Paycheck Calculator' }),
    ).toBeVisible();
  });

  test('disclaimer banner is visibly rendered with FICA detail', async ({
    page,
  }) => {
    const banner = page
      .locator('[role="note"]')
      .filter({ hasText: /Estimate only/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Tax Year/i);
    await expect(banner).toContainText(/Federal income tax/i);
    await expect(banner).toContainText(/state, local/i);
    await expect(banner).toContainText(/payroll system/i);
  });

  test('period selector renders all five options', async ({ page }) => {
    await page.waitForTimeout(2000);

    const periodSelect = page.locator('select[aria-label="Pay period"]');
    if (!(await periodSelect.isVisible())) {
      // Even when the dataset failed, the disclaimer is visible — assert it.
      await expect(
        page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
      ).toBeVisible();
      test.skip(true, 'Tax dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    const optionValues = await periodSelect.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => o.value),
    );
    expect(optionValues).toEqual([
      'weekly',
      'biweekly',
      'semimonthly',
      'monthly',
      'annual',
    ]);
  });

  test('happy path: 80k annual single → net pay positive with breakdown', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const grossInput = page.locator('input[aria-label="Gross pay per period"]');
    if (!(await grossInput.isVisible())) {
      test.skip(true, 'Tax dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    await grossInput.fill('80000');
    await page.waitForTimeout(300);

    const netPay = page.locator('[aria-label="Net pay per period"]');
    await expect(netPay).not.toHaveText('—', { timeout: 3000 });

    // Breakdown lines populated.
    await expect(
      page.locator('[aria-label="Federal income tax amount"]'),
    ).not.toHaveText('—');
    await expect(
      page.locator('[aria-label="Social Security amount"]'),
    ).not.toHaveText('—');
    await expect(page.locator('[aria-label="Medicare amount"]')).not.toHaveText(
      '—',
    );

    // Disclaimer still visible after a successful calculation.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    await expect(page.locator('button', { hasText: 'Copy' })).toBeEnabled();
  });

  test('malformed gross renders em-dash, inline error, and disclaimer stays visible', async ({
    page,
  }) => {
    await page.waitForTimeout(2000);

    const grossInput = page.locator('input[aria-label="Gross pay per period"]');
    if (!(await grossInput.isVisible())) {
      test.skip(true, 'Tax dataset unavailable in dev server (no Tauri runtime).');
      return;
    }

    await grossInput.fill('-5');
    await page.waitForTimeout(300);

    await expect(page.locator('text=Gross pay must be at least 0')).toBeVisible();

    const netPay = page.locator('[aria-label="Net pay per period"]');
    await expect(netPay).toHaveText('—');

    // Critical gate.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Estimate only/i }),
    ).toBeVisible();

    await expect(
      page.locator('h1', { hasText: 'Paycheck Calculator' }),
    ).toBeVisible();
  });
});
