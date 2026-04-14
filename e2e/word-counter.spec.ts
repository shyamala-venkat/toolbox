import { test, expect } from '@playwright/test';

/**
 * Helper to read a stat card value. Each StatCard renders:
 *   <div>
 *     <span class="text-2xl ... tabular-nums">{value}</span>
 *     <span class="text-xs ...">{label}</span>
 *   </div>
 * We locate by the label text (exact match) then read the sibling value span.
 */
async function getStatValue(page: import('@playwright/test').Page, label: string): Promise<string> {
  // Find the span containing exactly the label text, then go to parent div and read the value
  const labelSpan = page.locator('span.text-xs', { hasText: new RegExp(`^${label}$`) });
  const card = labelSpan.locator('..');
  const valueSpan = card.locator('span.tabular-nums');
  return (await valueSpan.textContent()) ?? '';
}

test.describe('Word Counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/word-counter');
    await expect(page.locator('h1', { hasText: 'Word' })).toBeVisible();
  });

  test('type "Hello world foo bar" shows 4 words and 19 characters', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Text to analyze"]');
    await input.fill('Hello world foo bar');

    // Word counter uses useMemo (no debounce), so values update on next render
    await expect(async () => {
      const words = await getStatValue(page, 'Words');
      expect(words).toBe('4');
    }).toPass({ timeout: 3000 });

    const chars = await getStatValue(page, 'Characters');
    expect(chars).toBe('19');
  });

  test('empty input shows 0 for all stats', async ({ page }) => {
    // Default state with empty input
    const words = await getStatValue(page, 'Words');
    expect(words).toBe('0');

    const chars = await getStatValue(page, 'Characters');
    expect(chars).toBe('0');
  });
});
