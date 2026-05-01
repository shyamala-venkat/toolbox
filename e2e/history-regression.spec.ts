import { test, expect } from '@playwright/test';

/**
 * History drawer regression smoke (PR-B.3).
 *
 * The drawer is rendered alongside every text-eligible tool (~22 in v1).
 * If the new flex sibling, the keyboard handler, or the
 * `useHistoryCapture` hook accidentally interferes with a tool's primary
 * happy path, this spec catches it. We pick a representative cross-section
 * across categories rather than enumerating all 22 tools — the goal is
 * "did mounting the drawer change tool behavior anywhere," not exhaustive
 * coverage (the per-tool specs already do that for tools that have them).
 *
 * For each tool:
 *   - Navigate to the route
 *   - Verify the heading and a primary input are visible
 *   - Type a representative valid input and assert the expected output
 *
 * The selectors mirror what the existing per-tool specs already use, so
 * any drift between tool components and these tests will surface as a
 * matched-pair failure.
 */
test.describe('History wiring regression smoke', () => {
  test('json-formatter still produces formatted output', async ({ page }) => {
    await page.goto('/tools/json-formatter');
    await expect(page.locator('h1', { hasText: 'JSON Formatter' })).toBeVisible();

    const input = page.locator('textarea[aria-label="JSON input"]');
    await expect(input).toBeVisible();
    await input.fill('{"x":1,"y":2}');

    const output = page.locator('textarea[aria-label="Formatted JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });
    expect(await output.inputValue()).toContain('"x": 1');
  });

  test('sql-formatter still produces formatted SQL', async ({ page }) => {
    await page.goto('/tools/sql-formatter');
    await expect(page.locator('h1', { hasText: 'SQL Formatter' })).toBeVisible();

    const input = page.locator('textarea[aria-label="SQL input"]');
    await expect(input).toBeVisible();
    await input.fill('select id, name from users where id=1');

    const output = page.locator('textarea[aria-label="Formatted SQL output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });
    const value = await output.inputValue();
    // sql-formatter always uppercases keywords by default and inserts
    // newlines around clauses, so a multi-line uppercase SELECT is the
    // strongest single-token signal.
    expect(value.toUpperCase()).toContain('SELECT');
    expect(value.split('\n').length).toBeGreaterThan(1);
  });

  test('base64 still encodes', async ({ page }) => {
    await page.goto('/tools/base64');
    await expect(page.locator('h1', { hasText: 'Base64' })).toBeVisible();

    const input = page.locator('textarea[aria-label="Plain text input"]');
    await expect(input).toBeVisible();
    await input.fill('Hello World');

    const output = page.locator('textarea[aria-label="Base64 output"]');
    await expect(output).toHaveValue('SGVsbG8gV29ybGQ=', { timeout: 3000 });
  });

  test('regex-tester still highlights matches', async ({ page }) => {
    await page.goto('/tools/regex-tester');
    await expect(page.locator('h1', { hasText: 'Regex Tester' })).toBeVisible();

    const pattern = page.locator('input[aria-label="Regex pattern"]');
    await expect(pattern).toBeVisible();
    await pattern.fill('foo');

    const test = page.locator('textarea[aria-label="Test input"]');
    await test.fill('foo bar foo');

    // The match-count "2 matches" copy is the most reliable single signal.
    await expect(page.locator('text=/\\d+ matches/').first()).toBeVisible({ timeout: 5000 });
  });

  test('text-diff still renders both inputs', async ({ page }) => {
    await page.goto('/tools/text-diff');
    await expect(page.locator('h1', { hasText: 'Text Diff' })).toBeVisible();

    const original = page.locator('textarea[aria-label="Original text"]');
    const changed = page.locator('textarea[aria-label="Changed text"]');
    await expect(original).toBeVisible();
    await expect(changed).toBeVisible();

    // Type a small diff. We don't assert specific diff output (text-diff
    // has multiple modes; this regression just needs to confirm the
    // drawer-mounted page didn't break input handling).
    await original.fill('line one\nline two');
    await changed.fill('line one\nline two changed');

    await expect(original).toHaveValue('line one\nline two');
    await expect(changed).toHaveValue('line one\nline two changed');
  });

  test('yaml-json still converts YAML to JSON', async ({ page }) => {
    await page.goto('/tools/yaml-json');
    await expect(page.locator('h1', { hasText: 'YAML' })).toBeVisible();

    // Default direction is YAML → JSON, so the input label is "YAML input".
    const input = page.locator('textarea[aria-label="YAML input"]');
    await expect(input).toBeVisible();
    await input.fill('foo: 1\nbar: hello');

    const output = page.locator('textarea[aria-label="JSON output"]');
    await expect(output).not.toHaveValue('', { timeout: 3000 });
    const value = await output.inputValue();
    expect(value).toContain('"foo"');
    expect(value).toContain('"bar"');
  });

  test('markdown-preview still renders the preview pane', async ({ page }) => {
    await page.goto('/tools/markdown-preview');
    await expect(page.locator('h1', { hasText: 'Markdown Preview' })).toBeVisible();

    const input = page.locator('textarea[aria-label="Markdown input"]');
    await expect(input).toBeVisible();
    await input.fill('# Hello');

    // The Markdown renders into the "Preview" panel as live HTML. Wait for
    // an <h1> with the rendered text.
    const preview = page.locator('h1', { hasText: 'Hello' }).last();
    await expect(preview).toBeVisible({ timeout: 3000 });
  });
});
