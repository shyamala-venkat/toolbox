import { test, expect } from '@playwright/test';

test.describe('Home screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('home page loads with search bar and category cards', async ({ page }) => {
    // Search bar should be visible
    const searchInput = page.getByPlaceholder('What do you want to do');
    await expect(searchInput).toBeVisible();

    // Category cards should be visible (buttons inside the Categories section)
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();

    // Tool cards should exist on the page (popular tools)
    const toolCards = page.locator('.tb-tool-card');
    await expect(toolCards.first()).toBeVisible();
    const count = await toolCards.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('popular tools section shows editorial picks with tier badges', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Popular Tools' })).toBeVisible();

    // Should have tier badge text
    const freeBadges = page.getByText('FREE', { exact: true });
    const count = await freeBadges.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('privacy badge is visible', async ({ page }) => {
    await expect(page.getByText('Everything runs on your computer')).toBeVisible();
  });

  test('search filters tools and shows results', async ({ page }) => {
    const searchInput = page.getByPlaceholder('What do you want to do');
    await searchInput.fill('pdf');
    await page.waitForTimeout(300);

    // Should show search results with result count
    await expect(page.getByText(/result/i)).toBeVisible({ timeout: 3000 });

    // Categories heading should be hidden (replaced by search results)
    await expect(page.getByRole('heading', { name: 'Categories' })).not.toBeVisible();
  });

  test('synonym search works — "shrink" finds compress tools', async ({ page }) => {
    const searchInput = page.getByPlaceholder('What do you want to do');
    await searchInput.fill('shrink');
    await page.waitForTimeout(300);

    // Should find compress tools via synonym — look for the result count
    await expect(page.getByText(/result/i)).toBeVisible({ timeout: 3000 });

    // At least one compress tool should appear
    await expect(page.getByText('Compress', { exact: false }).first()).toBeVisible();
  });
});
