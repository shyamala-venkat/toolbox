import { test, expect } from '@playwright/test';

test.describe('Expense Splitter tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/expense-splitter');
    await expect(page.locator('h1', { hasText: 'Expense Splitter' })).toBeVisible();
  });

  test('happy path 2-person: A pays $30 → B owes A $15', async ({ page }) => {
    const personInputs = page.locator('input[aria-label="Person name"]');
    await personInputs.nth(0).fill('Alice');
    await personInputs.nth(1).fill('Bob');

    // Add an expense.
    await page.getByRole('button', { name: 'Add expense' }).click();

    const payerSelect = page.locator('select[aria-label="Expense payer"]').first();
    const amountInput = page.locator('input[aria-label="Expense amount"]').first();

    await payerSelect.selectOption({ label: 'Alice' });
    await amountInput.fill('30');

    // Wait for the debounce + memo to settle.
    await page.waitForTimeout(300);

    // Total visible.
    await expect(page.locator('[aria-label="Total amount"]')).toHaveText('$30.00');

    // Settlement line: Bob → Alice $15.00.
    const settlements = page.locator('ul[aria-label="Settlements"] li');
    await expect(settlements).toHaveCount(1);
    const txt = await settlements.first().innerText();
    expect(txt).toContain('Bob');
    expect(txt).toContain('Alice');
    expect(txt).toContain('$15.00');

    // Settled badge NOT visible.
    await expect(page.getByRole('status', { name: /settled/i })).toHaveCount(0);
  });

  test('balanced 3-person trip: A $30, B $30, C $0 → C pays A and B $10 each', async ({ page }) => {
    const personInputs = page.locator('input[aria-label="Person name"]');
    await personInputs.nth(0).fill('Alice');
    await personInputs.nth(1).fill('Bob');

    // Add a third person.
    await page.getByRole('button', { name: 'Add person' }).click();
    await page.locator('input[aria-label="Person name"]').nth(2).fill('Carol');

    // Three expenses.
    const addExpense = page.getByRole('button', { name: 'Add expense' });

    await addExpense.click();
    await page
      .locator('select[aria-label="Expense payer"]')
      .nth(0)
      .selectOption({ label: 'Alice' });
    await page.locator('input[aria-label="Expense amount"]').nth(0).fill('30');

    await addExpense.click();
    await page
      .locator('select[aria-label="Expense payer"]')
      .nth(1)
      .selectOption({ label: 'Bob' });
    await page.locator('input[aria-label="Expense amount"]').nth(1).fill('30');

    await page.waitForTimeout(300);

    await expect(page.locator('[aria-label="Total amount"]')).toHaveText('$60.00');

    const settlements = page.locator('ul[aria-label="Settlements"] li');
    await expect(settlements).toHaveCount(2);

    // Both lines should be Carol paying $10. Pair-payoff order is Carol→Alice, Carol→Bob
    // (or vice versa depending on iteration); verify both are present.
    const allText = await settlements.allInnerTexts();
    const joined = allText.join(' | ');
    expect(joined).toContain('Carol');
    expect(joined).toContain('Alice');
    expect(joined).toContain('Bob');
    // Two $10.00 entries.
    const tenMatches = joined.match(/\$10\.00/g) ?? [];
    expect(tenMatches.length).toBeGreaterThanOrEqual(2);
  });

  test('settled state: A $20, B $20 → Settled badge visible', async ({ page }) => {
    const personInputs = page.locator('input[aria-label="Person name"]');
    await personInputs.nth(0).fill('Alice');
    await personInputs.nth(1).fill('Bob');

    const addExpense = page.getByRole('button', { name: 'Add expense' });

    await addExpense.click();
    await page
      .locator('select[aria-label="Expense payer"]')
      .nth(0)
      .selectOption({ label: 'Alice' });
    await page.locator('input[aria-label="Expense amount"]').nth(0).fill('20');

    await addExpense.click();
    await page
      .locator('select[aria-label="Expense payer"]')
      .nth(1)
      .selectOption({ label: 'Bob' });
    await page.locator('input[aria-label="Expense amount"]').nth(1).fill('20');

    await page.waitForTimeout(300);

    await expect(page.locator('[aria-label="Total amount"]')).toHaveText('$40.00');

    // Settled badge visible.
    await expect(page.getByText('Settled', { exact: true })).toBeVisible();

    // Zero settlements.
    await expect(page.locator('ul[aria-label="Settlements"]')).toHaveCount(0);
  });

  test('malformed amount shows inline error and does not crash', async ({ page }) => {
    const personInputs = page.locator('input[aria-label="Person name"]');
    await personInputs.nth(0).fill('Alice');
    await personInputs.nth(1).fill('Bob');

    await page.getByRole('button', { name: 'Add expense' }).click();
    await page
      .locator('select[aria-label="Expense payer"]')
      .first()
      .selectOption({ label: 'Alice' });
    await page.locator('input[aria-label="Expense amount"]').first().fill('abc');

    await page.waitForTimeout(300);

    // Inline error appears.
    await expect(page.getByText(/Amount must be a number/i)).toBeVisible();

    // Tool header still visible — error boundary did NOT engage.
    await expect(page.locator('h1', { hasText: 'Expense Splitter' })).toBeVisible();

    // No valid expenses → empty-state message visible.
    await expect(page.getByText('Add expenses to see settlement')).toBeVisible();
  });
});
