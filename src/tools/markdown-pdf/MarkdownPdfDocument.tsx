/**
 * React-PDF `<Document>` for markdown export.
 *
 * Walks a marked Token[] (from tokenizeForPdf) and emits a tree of
 * react-pdf primitives (Document → Page → View/Text/Link). The
 * resulting PDF is vector-text and searchable.
 *
 * Token-type coverage matches the in-app preview:
 *   heading (depth 1-6) · paragraph · text · strong · em · codespan ·
 *   code (fenced) · blockquote · list (ord/unord, nested) · hr · link ·
 *   del · table · space.
 *
 * Tokens we don't render meaningfully:
 *   - `html` is rendered as plain text (no HTML interpretation; react-pdf
 *     can't accept arbitrary HTML).
 *   - `image` renders the alt text only. Embedding actual image bytes
 *     would need a Rust-side fetch (CSP forbids remote fetch from the
 *     renderer); deferred.
 */

import type { ReactNode } from 'react';
import { Document, Page, Text, View, Link } from '@react-pdf/renderer';
import type { Tokens } from 'marked';
import { styles } from './markdownPdfStyles';
import { decodeEntities } from './markdownToPdfTokens';

interface MarkdownPdfDocumentProps {
  tokens: Tokens.Generic[];
}

export function MarkdownPdfDocument({ tokens }: MarkdownPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {tokens.map((tok, i) => (
          <BlockToken key={i} token={tok} />
        ))}
      </Page>
    </Document>
  );
}

// ─── Block-level renderer ────────────────────────────────────────────────

interface BlockTokenProps {
  token: Tokens.Generic;
}

function BlockToken({ token }: BlockTokenProps) {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      const styleKey = (`h${Math.max(1, Math.min(6, t.depth))}` as
        | 'h1'
        | 'h2'
        | 'h3'
        | 'h4'
        | 'h5'
        | 'h6');
      return <Text style={styles[styleKey]}>{renderInline(t.tokens ?? [])}</Text>;
    }

    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      return <Text style={styles.paragraph}>{renderInline(t.tokens ?? [])}</Text>;
    }

    case 'space':
      // marked emits `space` between blocks; padding already lives in
      // each block's marginTop/marginBottom, so we just no-op here.
      return null;

    case 'hr':
      return <View style={styles.hr} />;

    case 'code': {
      const t = token as Tokens.Code;
      // `wrap` so long code blocks paginate cleanly.
      return (
        <View style={styles.codeBlock} wrap>
          <Text>{decodeEntities(t.text)}</Text>
        </View>
      );
    }

    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      return (
        <View style={styles.blockquote}>
          {(t.tokens ?? []).map((inner, i) => (
            <BlockToken key={i} token={inner} />
          ))}
        </View>
      );
    }

    case 'list': {
      const t = token as Tokens.List;
      return <ListBlock list={t} />;
    }

    case 'table': {
      const t = token as Tokens.Table;
      return <TableBlock table={t} />;
    }

    case 'html': {
      const t = token as Tokens.HTML;
      // No HTML interpretation; emit as plain text so the user at least
      // sees the content.
      const raw = decodeEntities(stripTags(t.text));
      if (raw.trim().length === 0) return null;
      return <Text style={styles.paragraph}>{raw}</Text>;
    }

    default: {
      // Unknown block — best effort: render its raw text if present.
      const raw = (token as Tokens.Generic).raw;
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return <Text style={styles.paragraph}>{decodeEntities(raw)}</Text>;
      }
      return null;
    }
  }
}

// ─── Inline renderer ─────────────────────────────────────────────────────

/**
 * Render an inline-token array into a flat array of React-PDF nodes
 * (mostly `<Text>` runs and `<Link>`s). Inline mixed styling — bold
 * inside italic inside a paragraph — is React-PDF's strength: nested
 * `<Text>` inherits style from its parent.
 */
function renderInline(tokens: Tokens.Generic[]): ReactNode[] {
  return tokens.map((tok, i) => renderInlineOne(tok, i));
}

function renderInlineOne(token: Tokens.Generic, key: number): ReactNode {
  switch (token.type) {
    case 'text': {
      const t = token as Tokens.Text;
      // marked sometimes hands back `text` tokens whose content is itself
      // tokenized (when the inline contained mixed runs). Prefer the
      // tokenized form when present; otherwise emit the raw text.
      if (t.tokens && t.tokens.length > 0) {
        return <Text key={key}>{renderInline(t.tokens as Tokens.Generic[])}</Text>;
      }
      return <Text key={key}>{decodeEntities(t.text)}</Text>;
    }

    case 'strong': {
      const t = token as Tokens.Strong;
      return (
        <Text key={key} style={styles.strong}>
          {renderInline(t.tokens ?? [])}
        </Text>
      );
    }

    case 'em': {
      const t = token as Tokens.Em;
      return (
        <Text key={key} style={styles.em}>
          {renderInline(t.tokens ?? [])}
        </Text>
      );
    }

    case 'del': {
      const t = token as Tokens.Del;
      return (
        <Text key={key} style={styles.del}>
          {renderInline(t.tokens ?? [])}
        </Text>
      );
    }

    case 'codespan': {
      const t = token as Tokens.Codespan;
      return (
        <Text key={key} style={styles.codeInline}>
          {decodeEntities(t.text)}
        </Text>
      );
    }

    case 'link': {
      const t = token as Tokens.Link;
      return (
        <Link key={key} src={t.href} style={styles.link}>
          {renderInline(t.tokens ?? [])}
        </Link>
      );
    }

    case 'image': {
      const t = token as Tokens.Image;
      // Render as italic alt text. Real image embedding deferred.
      return (
        <Text key={key} style={styles.em}>
          [{t.text || 'image'}]
        </Text>
      );
    }

    case 'br':
      return <Text key={key}>{'\n'}</Text>;

    case 'html': {
      const t = token as Tokens.HTML;
      return <Text key={key}>{decodeEntities(stripTags(t.text))}</Text>;
    }

    case 'escape': {
      const t = token as Tokens.Escape;
      return <Text key={key}>{t.text}</Text>;
    }

    default: {
      const raw = (token as Tokens.Generic).raw;
      if (typeof raw === 'string') {
        return <Text key={key}>{decodeEntities(raw)}</Text>;
      }
      return null;
    }
  }
}

// ─── Lists ───────────────────────────────────────────────────────────────

function ListBlock({ list }: { list: Tokens.List }) {
  return (
    <View style={styles.list}>
      {list.items.map((item, i) => (
        <ListItemBlock key={i} item={item} index={i} ordered={list.ordered} start={list.start} />
      ))}
    </View>
  );
}

function ListItemBlock({
  item,
  index,
  ordered,
  start,
}: {
  item: Tokens.ListItem;
  index: number;
  ordered: boolean;
  start: number | '';
}) {
  const startNum = typeof start === 'number' ? start : 1;
  const marker = ordered ? `${startNum + index}.` : '•';

  // Each list item has its own `tokens` (block-level children — usually
  // a single paragraph, sometimes nested lists). Render them as block
  // children inside the item's content column.
  return (
    <View style={styles.listItem} wrap={false}>
      <Text style={styles.listMarker}>{marker}</Text>
      <View style={styles.listContent}>
        {(item.tokens ?? []).map((inner, i) => {
          // The most common shape is a single `text` block whose own
          // `tokens` are the inline runs of the item content. Render
          // those inline rather than wrapping in a paragraph margin.
          if (inner.type === 'text') {
            const t = inner as Tokens.Text;
            return (
              <Text key={i}>
                {renderInline((t.tokens as Tokens.Generic[]) ?? [
                  { type: 'text', raw: t.text, text: t.text } as Tokens.Generic,
                ])}
              </Text>
            );
          }
          return <BlockToken key={i} token={inner} />;
        })}
      </View>
    </View>
  );
}

// ─── Tables ──────────────────────────────────────────────────────────────

function TableBlock({ table }: { table: Tokens.Table }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {table.header.map((cell, i) => (
          <Text key={i} style={styles.tableHeaderCell}>
            {renderInline(cell.tokens ?? [])}
          </Text>
        ))}
      </View>
      {table.rows.map((row, ri) => (
        <View key={ri} style={styles.tableRow}>
          {row.map((cell, ci) => (
            <Text key={ci} style={styles.tableCell}>
              {renderInline(cell.tokens ?? [])}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}
