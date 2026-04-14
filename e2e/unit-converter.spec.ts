import { test, expect } from '@playwright/test';

test.describe('Unit Converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/unit-converter');
    await expect(page.locator('h1', { hasText: 'Unit Converter' })).toBeVisible();
  });

  test('Length: 1 mile to km shows approximately 1.60934', async ({ page }) => {
    // Default category is Length, default from is miles, default to is km
    // Verify the category select shows Length
    const categorySelect = page.locator('select[aria-label="Unit category"]');
    await expect(categorySelect).toHaveValue('length');

    // Verify from unit is miles
    const fromSelect = page.locator('select[aria-label="Convert from unit"]');
    await expect(fromSelect).toHaveValue('mi');

    // Verify to unit is km
    const toSelect = page.locator('select[aria-label="Convert to unit"]');
    await expect(toSelect).toHaveValue('km');

    // Default input is "1" — check the result
    const resultInput = page.locator('input[aria-label="Conversion result"]');
    const resultValue = await resultInput.inputValue();
    expect(parseFloat(resultValue)).toBeCloseTo(1.60934, 3);
  });

  test('Temperature: 100 Celsius to Fahrenheit shows 212', async ({ page }) => {
    // Change category to Temperature
    const categorySelect = page.locator('select[aria-label="Unit category"]');
    await categorySelect.selectOption('temperature');

    // Set from to Celsius
    const fromSelect = page.locator('select[aria-label="Convert from unit"]');
    await fromSelect.selectOption('C');

    // Set to to Fahrenheit
    const toSelect = page.locator('select[aria-label="Convert to unit"]');
    await toSelect.selectOption('F');

    // Type 100 in the input
    const valueInput = page.locator('input[aria-label="Value to convert"]');
    await valueInput.fill('100');

    // Check the result
    const resultInput = page.locator('input[aria-label="Conversion result"]');
    const resultValue = await resultInput.inputValue();
    expect(parseFloat(resultValue)).toBeCloseTo(212, 0);
  });
});
