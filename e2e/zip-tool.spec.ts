import { test, expect } from '@playwright/test';

test.describe('ZIP Tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/zip-tool');
    await expect(page.locator('h1', { hasText: 'ZIP Tool' })).toBeVisible();
  });

  test('tool page loads with Create and Extract tabs', async ({ page }) => {
    const createTab = page.locator('button[role="tab"]', { hasText: 'Create ZIP' });
    const extractTab = page.locator('button[role="tab"]', { hasText: 'Extract ZIP' });
    await expect(createTab).toBeVisible();
    await expect(extractTab).toBeVisible();
  });

  test('Create tab shows file drop zone and empty state', async ({ page }) => {
    // Create tab should be active by default
    const createTab = page.locator('button[role="tab"]', { hasText: 'Create ZIP' });
    await expect(createTab).toHaveAttribute('aria-selected', 'true');

    // Drop zone should be visible
    await expect(page.locator('text=Drop files here or click to browse')).toBeVisible();

    // Empty state should be visible
    await expect(page.locator('text=No files added yet')).toBeVisible();
  });

  test('Extract tab shows ZIP file drop zone and empty state', async ({ page }) => {
    // Switch to Extract tab
    const extractTab = page.locator('button[role="tab"]', { hasText: 'Extract ZIP' });
    await extractTab.click();

    // Drop zone should be visible
    await expect(page.locator('text=Drop a ZIP file here or click to browse')).toBeVisible();

    // Empty state should be visible
    await expect(page.locator('text=No ZIP file loaded')).toBeVisible();
  });
});
