import { test, expect } from '@playwright/test';

test.describe('Dark/light mode', () => {
  test('default theme has data-theme attribute on html', async ({ page }) => {
    await page.goto('/');
    // The app sets data-theme on <html> via applyThemeToDocument.
    // The default is 'system', which resolves to either 'light' or 'dark'.
    const dataTheme = await page.locator('html').getAttribute('data-theme');
    expect(dataTheme).toMatch(/^(light|dark)$/);
  });

  test('switching to dark mode adds data-theme="dark" to html', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

    // Click the dark theme radio button's visual label
    const darkLabel = page.locator('label').filter({ has: page.locator('input[name="theme"][value="dark"]') });
    await darkLabel.click();

    // Verify data-theme is set to dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('switching to light mode adds data-theme="light" to html', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

    // Click the light theme radio button's visual label
    const lightLabel = page.locator('label').filter({ has: page.locator('input[name="theme"][value="light"]') });
    await lightLabel.click();

    // Verify data-theme is set to light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('tool page renders correctly in dark mode', async ({ page }) => {
    // Set dark mode first
    await page.goto('/settings');
    const darkLabel = page.locator('label').filter({ has: page.locator('input[name="theme"][value="dark"]') });
    await darkLabel.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Navigate to a tool
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    // Verify key elements have non-transparent backgrounds (CSS variables are resolved)
    // Check the sidebar has a background
    const sidebar = page.locator('aside');
    const sidebarBg = await sidebar.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor;
    });
    // Should not be transparent (rgba(0,0,0,0))
    expect(sidebarBg).not.toBe('rgba(0, 0, 0, 0)');

    // Check the main content area has a background
    const main = page.locator('main');
    const mainBg = await main.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor;
    });
    expect(mainBg).not.toBe('rgba(0, 0, 0, 0)');
  });
});
