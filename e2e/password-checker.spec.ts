import { test, expect } from '@playwright/test';

test.describe('Password Strength Checker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/password-checker');
    await expect(page.locator('h1', { hasText: 'Password Strength Checker' })).toBeVisible();
  });

  test('tool page loads with password input', async ({ page }) => {
    const input = page.locator('input[aria-label="Password to check"]');
    await expect(input).toBeVisible();
  });

  test('entering a common password shows Weak strength', async ({ page }) => {
    const input = page.locator('input[aria-label="Password to check"]');
    await input.fill('password123');

    // Wait for debounce
    await page.waitForTimeout(300);

    // Should show "Weak" strength label
    await expect(page.locator('text=Weak')).toBeVisible({ timeout: 3000 });

    // Should show common password warning
    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('top-100 most common passwords');
  });

  test('entering a strong password shows Strong or better', async ({ page }) => {
    const input = page.locator('input[aria-label="Password to check"]');
    await input.fill('Tr0ub4dor&3xPl0it!2024');

    // Wait for debounce
    await page.waitForTimeout(300);

    // Should show Character Sets section
    await expect(page.locator('text=Character Sets')).toBeVisible({ timeout: 3000 });

    // Should show Estimated Crack Time section
    await expect(page.locator('text=Estimated Crack Time')).toBeVisible();
  });
});
