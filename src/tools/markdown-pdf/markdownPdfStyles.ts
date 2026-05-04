/**
 * React-PDF stylesheet for the markdown export.
 *
 * Sizes/weights mirror the in-app preview (PRINT_CSS in MarkdownPdf.tsx
 * before this revision) so the saved PDF matches the on-screen render
 * the user has been editing against.
 *
 * Default fonts are React-PDF's built-in Helvetica + Courier; no font
 * file fetch happens at export time, which keeps the first-export
 * latency low and avoids a network dependency that would violate the
 * local-first invariant.
 */

import { StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 56,
    paddingRight: 56,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.55,
    color: '#1a1a1a',
  },

  // ─── Headings ───────────────────────────────────────────────────────
  h1: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    marginTop: 0,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  h2: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  h3: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
  },
  h4: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 4,
  },
  h5: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
  },
  h6: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
    color: '#555555',
  },

  // ─── Body ───────────────────────────────────────────────────────────
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    fontFamily: 'Helvetica-Bold',
  },
  em: {
    fontFamily: 'Helvetica-Oblique',
  },
  strongEm: {
    fontFamily: 'Helvetica-BoldOblique',
  },
  del: {
    textDecoration: 'line-through',
  },
  link: {
    color: '#0a66c2',
    textDecoration: 'underline',
  },

  // ─── Code ───────────────────────────────────────────────────────────
  codeInline: {
    fontFamily: 'Courier',
    fontSize: 10,
    backgroundColor: '#f4f4f4',
    paddingLeft: 3,
    paddingRight: 3,
    paddingTop: 1,
    paddingBottom: 1,
    borderRadius: 2,
  },
  codeBlock: {
    fontFamily: 'Courier',
    fontSize: 9.5,
    backgroundColor: '#f6f8fa',
    color: '#1a1a1a',
    padding: 8,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: '#d0d7de',
    borderLeftStyle: 'solid',
    lineHeight: 1.4,
  },

  // ─── Blockquote ─────────────────────────────────────────────────────
  blockquote: {
    marginTop: 6,
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#d0d7de',
    borderLeftStyle: 'solid',
    color: '#5a5a5a',
    fontFamily: 'Helvetica-Oblique',
  },

  // ─── Lists ──────────────────────────────────────────────────────────
  list: {
    marginTop: 2,
    marginBottom: 6,
    paddingLeft: 0,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  listMarker: {
    width: 18,
    fontFamily: 'Helvetica',
  },
  listContent: {
    flex: 1,
  },

  // ─── Horizontal rule ────────────────────────────────────────────────
  hr: {
    marginTop: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },

  // ─── Tables ─────────────────────────────────────────────────────────
  table: {
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderStyle: 'solid',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f6f8fa',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderTopStyle: 'solid',
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
  },
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
});
