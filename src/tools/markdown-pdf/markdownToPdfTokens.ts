/**
 * Wrapper around `marked.lexer()` for the PDF export pipeline.
 *
 * Why a wrapper: keeps the lexer call + entity decoding + project
 * tweaks in one pure, unit-testable function. The walker
 * (MarkdownPdfDocument) consumes the resulting Token array and never
 * needs to know about marked options or HTML entity decoding.
 */

import { marked, type Tokens } from 'marked';

export type AnyToken = Tokens.Generic | Tokens.Text | Tokens.Heading | Tokens.Paragraph;

/** Parse markdown into the Token tree react-pdf walker consumes. */
export function tokenizeForPdf(markdown: string): Tokens.Generic[] {
  if (markdown.trim().length === 0) return [];
  return marked.lexer(markdown, { gfm: true, breaks: true }) as Tokens.Generic[];
}

/**
 * Decode the small set of HTML entities that marked emits raw inside
 * `text`-type token strings (the lexer already decodes the common ones
 * but leaves a few in escaped form). Walker calls this on every plain
 * text leaf before rendering.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
