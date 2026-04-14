import { test, expect } from '@playwright/test';

test.describe('Core app navigation', () => {
  test('home page loads with tool grid', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1', { hasText: 'Welcome to ToolBox' })).toBeVisible();
    // The home page should have tool cards (buttons with class tb-tool-card)
    const toolCards = page.locator('.tb-tool-card');
    await expect(toolCards.first()).toBeVisible();
    const count = await toolCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a tool in sidebar navigates to /tools/{id}', async ({ page }) => {
    await page.goto('/');
    // The sidebar has tool rows — find one by its text content (e.g. JSON Formatter)
    const sidebarLink = page.locator('aside button', { hasText: 'JSON Formatter' });
    await sidebarLink.click();
    await expect(page).toHaveURL(/\/tools\/json-formatter/);
    // Verify the tool page loaded by checking the tool name in the header
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();
  });

  test('Cmd+K opens command palette, typing filters tools, Enter navigates', async ({ page }) => {
    await page.goto('/');
    // Open command palette with Cmd+K
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('[role="dialog"][aria-label="Command palette"]');
    await expect(dialog).toBeVisible();

    // Type to filter
    const searchInput = dialog.locator('input[aria-label="Search tools"]');
    await searchInput.fill('uuid');
    // Wait for filtered results
    await page.waitForTimeout(100);

    // The first result should contain "UUID"
    const firstResult = dialog.locator('[role="option"]').first();
    await expect(firstResult).toContainText('UUID');

    // Press Enter to navigate
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/tools\/uuid-generator/);
    // Palette should be closed
    await expect(dialog).not.toBeVisible();
  });

  test('/settings page loads with theme section', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
    // Check that the General section with theme options is present
    await expect(page.locator('span', { hasText: /^Theme$/ })).toBeVisible();
    // Verify the three theme radio options exist
    for (const theme of ['system', 'light', 'dark']) {
      await expect(page.locator(`input[type="radio"][name="theme"][value="${theme}"]`)).toBeAttached();
    }
  });

  test('404 page for /tools/nonexistent', async ({ page }) => {
    await page.goto('/tools/nonexistent');
    // The ToolRoute redirects unknown ids to /404
    await expect(page).toHaveURL(/\/404/);
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=Page not found')).toBeVisible();
  });
});
