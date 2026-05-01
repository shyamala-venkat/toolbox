import { test, expect } from '@playwright/test';

test.describe('Retirement Calculator tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/retirement');
    await expect(page.locator('h1', { hasText: 'Retirement Calculator' })).toBeVisible();
  });

  test('disclaimer banner is visibly rendered before any input', async ({ page }) => {
    // CRITICAL gate from /plan-eng-review: the disclaimer must be VISIBLE
    // even before any computation has happened.
    const banner = page.locator('[role="note"]').filter({
      hasText: /Deterministic projection/i,
    });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Assumes constant returns/i);
    await expect(banner).toContainText(/not a forecast/i);

    // Result block shows em-dash placeholder.
    const portfolio = page.locator('[aria-label="Portfolio at retirement"]');
    await expect(portfolio).toHaveText('—');
  });

  test('happy path: age 30→65, $10k savings, $500/mo, 7% renders portfolio + 4% rule', async ({
    page,
  }) => {
    await page.locator('input[aria-label="Current age"]').fill('30');
    await page.locator('input[aria-label="Retirement age"]').fill('65');
    await page.locator('input[aria-label="Current savings"]').fill('10000');
    await page.locator('input[aria-label="Monthly contribution"]').fill('500');
    await page.locator('input[aria-label="Expected annual return"]').fill('7');

    await page.waitForTimeout(300);

    const portfolio = page.locator('[aria-label="Portfolio at retirement"]');
    await expect(portfolio).not.toHaveText('—', { timeout: 3000 });
    await expect(portfolio).toContainText('$');

    // 4% rule heuristic block is visible with the labeled caveat.
    const heuristic = page.locator('[aria-label="4 percent rule heuristic"]');
    await expect(heuristic).toBeVisible();
    await expect(heuristic).toContainText('4% rule heuristic');
    await expect(heuristic).toContainText(/simplified retirement-feasibility check/i);
    await expect(
      page.locator('[aria-label="Annual withdrawal at 4 percent"]'),
    ).toContainText('$');
    await expect(
      page.locator('[aria-label="Monthly equivalent at 4 percent"]'),
    ).toContainText('$');

    // Disclaimer still visible after a successful calculation.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Deterministic projection/i }),
    ).toBeVisible();

    // Chart canvas is present.
    const chart = page.locator('[role="img"][aria-label*="Portfolio growth"]');
    await expect(chart).toBeVisible();
  });

  test('cross-field: retirement age ≤ current age shows inline error', async ({ page }) => {
    await page.locator('input[aria-label="Current age"]').fill('40');
    await page.locator('input[aria-label="Retirement age"]').fill('35');
    await page.locator('input[aria-label="Current savings"]').fill('10000');
    await page.locator('input[aria-label="Expected annual return"]').fill('7');

    await page.waitForTimeout(300);

    await expect(
      page.locator('text=Retirement age must be greater than current age'),
    ).toBeVisible();

    // Result remains em-dash — no projection generated.
    const portfolio = page.locator('[aria-label="Portfolio at retirement"]');
    await expect(portfolio).toHaveText('—');

    // Disclaimer stays visible.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Deterministic projection/i }),
    ).toBeVisible();
  });

  test('malformed return ("-5") renders inline error, disclaimer stays visible', async ({
    page,
  }) => {
    await page.locator('input[aria-label="Current age"]').fill('30');
    await page.locator('input[aria-label="Retirement age"]').fill('65');
    await page.locator('input[aria-label="Current savings"]').fill('1000');
    await page.locator('input[aria-label="Expected annual return"]').fill('-5');

    await page.waitForTimeout(300);

    const portfolio = page.locator('[aria-label="Portfolio at retirement"]');
    await expect(portfolio).toHaveText('—');

    await expect(
      page.locator('text=Expected return must be at least 0'),
    ).toBeVisible();

    // Disclaimer stays visible.
    await expect(
      page.locator('[role="note"]').filter({ hasText: /Deterministic projection/i }),
    ).toBeVisible();

    await expect(
      page.locator('h1', { hasText: 'Retirement Calculator' }),
    ).toBeVisible();
  });
});
