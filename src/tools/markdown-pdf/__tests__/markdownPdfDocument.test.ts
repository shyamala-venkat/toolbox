import { describe, it, expect } from 'vitest';
import { tokenizeForPdf, decodeEntities } from '../markdownToPdfTokens';

/**
 * Tests for the markdown → tokens pipeline that feeds React-PDF.
 *
 * We do NOT render to actual PDF bytes here — that requires a DOM-like
 * environment React-PDF can render into, which the project's vitest
 * config doesn't provide (we run in node). The walker (MarkdownPdfDocument)
 * is exercised end-to-end by manual export verification described in the
 * plan; the tokenization layer is what's worth pinning with fast unit
 * tests.
 */

describe('tokenizeForPdf', () => {
  it('returns an empty array for empty input', () => {
    expect(tokenizeForPdf('')).toEqual([]);
    expect(tokenizeForPdf('   ')).toEqual([]);
    expect(tokenizeForPdf('\n\n')).toEqual([]);
  });

  it('parses a heading', () => {
    const tokens = tokenizeForPdf('# Hello');
    expect(tokens).toHaveLength(1);
    const t = tokens[0] as unknown as { type: string; depth: number };
    expect(t.type).toBe('heading');
    // marked types Heading.depth as 1-6.
    expect(t.depth).toBe(1);
  });

  it('parses a fenced code block with language', () => {
    const md = '```js\nconst x = 1;\n```';
    const tokens = tokenizeForPdf(md);
    const code = tokens.find((t) => t.type === 'code') as unknown as
      | { lang: string; text: string }
      | undefined;
    expect(code).toBeDefined();
    expect(code!.lang).toBe('js');
    expect(code!.text).toBe('const x = 1;');
  });

  it('parses a GFM table', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const tokens = tokenizeForPdf(md);
    const table = tokens.find((t) => t.type === 'table') as unknown as
      | { header: unknown[]; rows: unknown[][] }
      | undefined;
    expect(table).toBeDefined();
    expect(table!.header).toHaveLength(2);
    expect(table!.rows).toHaveLength(1);
    expect(table!.rows[0]).toHaveLength(2);
  });

  it('parses an unordered nested list', () => {
    const md = '- a\n- b\n  - b1\n  - b2\n- c\n';
    const tokens = tokenizeForPdf(md);
    const list = tokens.find((t) => t.type === 'list') as unknown as
      | { items: { tokens: { type: string }[] }[] }
      | undefined;
    expect(list).toBeDefined();
    const items = list!.items;
    expect(items).toHaveLength(3);
    // The second item nests another list inside its tokens.
    const second = items[1];
    expect(second).toBeDefined();
    const innerList = second!.tokens.find((t) => t.type === 'list');
    expect(innerList).toBeDefined();
  });

  it('parses inline strong + em + codespan in a paragraph', () => {
    const md = 'a **bold** and *italic* with `code` here';
    const tokens = tokenizeForPdf(md);
    const para = tokens[0] as unknown as { type: string; tokens: { type: string }[] };
    expect(para.type).toBe('paragraph');
    const types = para.tokens.map((t) => t.type);
    expect(types).toContain('strong');
    expect(types).toContain('em');
    expect(types).toContain('codespan');
  });

  it('parses a blockquote with inner content', () => {
    const md = '> a quoted paragraph\n>\n> on two lines';
    const tokens = tokenizeForPdf(md);
    const bq = tokens.find((t) => t.type === 'blockquote') as unknown as
      | { tokens: unknown[] }
      | undefined;
    expect(bq).toBeDefined();
    expect(bq!.tokens.length).toBeGreaterThan(0);
  });

  it('parses a link', () => {
    const md = '[click](https://example.com)';
    const tokens = tokenizeForPdf(md);
    const para = tokens[0] as unknown as { tokens: { type: string; href?: string }[] };
    const link = para.tokens.find((t) => t.type === 'link');
    expect(link).toBeDefined();
    expect(link!.href).toBe('https://example.com');
  });

  it('parses an hr', () => {
    const tokens = tokenizeForPdf('---\n');
    expect(tokens.find((t) => t.type === 'hr')).toBeDefined();
  });

  it('parses strikethrough (GFM)', () => {
    const md = '~~strike~~';
    const tokens = tokenizeForPdf(md);
    const para = tokens[0] as unknown as { tokens: { type: string }[] };
    expect(para.tokens.find((t) => t.type === 'del')).toBeDefined();
  });

  it('handles a representative mixed document without throwing', () => {
    const md = `# Title

Some **bold** intro with a [link](https://example.com).

## Section

- a
- b
  - nested

\`\`\`ts
type X = number;
\`\`\`

> a quote

| h1 | h2 |
|----|----|
| 1  | 2  |

---

The end.`;
    const tokens = tokenizeForPdf(md);
    expect(tokens.length).toBeGreaterThan(5);
    // At minimum: heading, paragraph, heading, list, code, blockquote, table, hr, paragraph
    const types = tokens.map((t) => t.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('list');
    expect(types).toContain('code');
    expect(types).toContain('blockquote');
    expect(types).toContain('table');
    expect(types).toContain('hr');
  });
});

describe('decodeEntities', () => {
  it('decodes the common HTML entities', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&#39;')).toBe(`&<>"\'`);
  });

  it('leaves non-entity text untouched', () => {
    expect(decodeEntities('hello world')).toBe('hello world');
    expect(decodeEntities('no entities here: a&b')).toBe('no entities here: a&b');
  });

  it("decodes &#x27; to a single quote", () => {
    expect(decodeEntities('it&#x27;s')).toBe("it's");
  });
});
