import { test, expect } from '@playwright/test';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test.describe('UUID Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/uuid-generator');
    await expect(page.locator('h1', { hasText: 'UUID Generator' })).toBeVisible();
  });

  test('click Generate shows UUIDs in output', async ({ page }) => {
    // Initially should show "No UUIDs yet"
    await expect(page.locator('text=No UUIDs yet')).toBeVisible();

    // Click the Generate button
    const generateButton = page.locator('button', { hasText: 'Generate' });
    await generateButton.click();

    // UUIDs should appear — the list of code elements
    const uuidCodes = page.locator('ul li code');
    await expect(uuidCodes.first()).toBeVisible();
  });

  test('generated UUID matches v4 format', async ({ page }) => {
    // Ensure v4 is selected (default)
    const v4Radio = page.locator('button[role="radio"][aria-checked="true"]', { hasText: 'v4' });
    await expect(v4Radio).toBeVisible();

    // Generate
    const generateButton = page.locator('button', { hasText: 'Generate' });
    await generateButton.click();

    // Get the UUID text
    const uuidCode = page.locator('ul li code').first();
    const uuid = await uuidCode.textContent();
    expect(uuid).toBeTruthy();
    expect(uuid!.trim()).toMatch(UUID_V4_REGEX);
  });

  test('bulk generate 5 shows exactly 5 UUIDs', async ({ page }) => {
    // Set count to 5
    const countInput = page.locator('input[aria-label="Number of UUIDs to generate"]');
    await countInput.fill('5');

    // Generate
    const generateButton = page.locator('button', { hasText: 'Generate' });
    await generateButton.click();

    // Should show exactly 5 UUIDs
    const uuidCodes = page.locator('ul li code');
    await expect(uuidCodes).toHaveCount(5);

    // Header should say "5 UUIDs"
    await expect(page.locator('text=5 UUIDs')).toBeVisible();
  });
});
