/**
 * XML pretty-printer and minifier.
 *
 * We parse with the native browser DOMParser (which does NOT execute scripts
 * or resolve external entities) and then walk the resulting DOM to emit a
 * plain string. The output is returned as text — callers must render it via
 * a textarea's `value`, never innerHTML — so DOMParser's inert tree is
 * defense in depth rather than the primary security boundary.
 *
 * There is no native browser pretty-printer for XML, so the walker here is
 * hand-rolled. It's intentionally tiny: it handles elements, attributes, text,
 * CDATA, comments, and processing instructions. Anything more exotic (DTDs,
 * entity declarations) round-trips via the serializer as-is.
 */

export interface XmlFormatResult {
  output: string;
  error: string | null;
  errorLine: number | null;
}

export type XmlIndent = '2' | '4' | 'tab';

const XML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const escapeText = (text: string): string =>
  text.replace(/[&<>]/g, (ch) => XML_ENTITY_MAP[ch] ?? ch);

const escapeAttr = (text: string): string =>
  text.replace(/[&<>"]/g, (ch) => XML_ENTITY_MAP[ch] ?? ch);

const indentString = (choice: XmlIndent): string => {
  if (choice === 'tab') return '\t';
  return ' '.repeat(Number.parseInt(choice, 10));
};

/**
 * Walk the DOM and emit indented XML. `depth` is the current nesting level;
 * `unit` is the string repeated per level.
 */
function serializeNode(node: Node, depth: number, unit: string): string {
  const pad = unit.repeat(depth);

  switch (node.nodeType) {
    case 1 /* Node.ELEMENT_NODE */: {
      const el = node as Element;
      const name = el.tagName;
      let attrs = '';
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        if (!attr) continue;
        attrs += ` ${attr.name}="${escapeAttr(attr.value)}"`;
      }

      // Partition children into whitespace-only text (which we ignore) vs
      // everything else (which we keep).
      const realChildren: Node[] = [];
      for (let i = 0; i < el.childNodes.length; i += 1) {
        const child = el.childNodes[i];
        if (!child) continue;
        if (child.nodeType === 3 /* TEXT_NODE */) {
          const text = child.nodeValue ?? '';
          if (text.trim().length === 0) continue;
        }
        realChildren.push(child);
      }

      if (realChildren.length === 0) {
        return `${pad}<${name}${attrs}/>`;
      }

      // Inline-text shortcut: single text child collapses to `<tag>value</tag>`.
      if (realChildren.length === 1 && realChildren[0]?.nodeType === 3) {
        const text = (realChildren[0].nodeValue ?? '').trim();
        return `${pad}<${name}${attrs}>${escapeText(text)}</${name}>`;
      }

      const parts: string[] = [`${pad}<${name}${attrs}>`];
      for (const child of realChildren) {
        parts.push(serializeNode(child, depth + 1, unit));
      }
      parts.push(`${pad}</${name}>`);
      return parts.join('\n');
    }
    case 3 /* TEXT_NODE */: {
      const text = (node.nodeValue ?? '').trim();
      if (text.length === 0) return '';
      return `${pad}${escapeText(text)}`;
    }
    case 4 /* CDATA_SECTION_NODE */: {
      return `${pad}<![CDATA[${node.nodeValue ?? ''}]]>`;
    }
    case 7 /* PROCESSING_INSTRUCTION_NODE */: {
      const pi = node as ProcessingInstruction;
      return `${pad}<?${pi.target} ${pi.data}?>`;
    }
    case 8 /* COMMENT_NODE */: {
      return `${pad}<!--${node.nodeValue ?? ''}-->`;
    }
    default:
      return '';
  }
}

/**
 * Minify: strip whitespace between tags and collapse to a single line.
 * We still parse first so we catch malformed documents.
 */
function minifyTree(root: Document): string {
  const serializer = new XMLSerializer();
  const serialized = serializer.serializeToString(root);
  // Strip whitespace between tags (`>   <` → `><`). Whitespace inside text
  // nodes is preserved as-is because it can be semantically meaningful.
  return serialized.replace(/>\s+</g, '><').trim();
}

/**
 * Parse and pretty-print XML. Returns `{ output, error }` — callers decide
 * how to render the error.
 */
export function formatXml(raw: string, indent: XmlIndent): XmlFormatResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { output: '', error: null, errorLine: null };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    // DOMParser puts human-readable detail in the <parsererror> body.
    const detail = parserError.textContent?.trim() ?? 'Invalid XML';
    // Try to extract a line number from the typical Firefox/WebKit format.
    const lineMatch = /line\s*[:=]?\s*(\d+)/i.exec(detail);
    const line = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : null;
    // The message can be multi-paragraph; keep it to a single tidy line.
    const firstLine = detail.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? 'Invalid XML';
    return {
      output: '',
      error: firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine,
      errorLine: Number.isFinite(line) ? line : null,
    };
  }

  const unit = indentString(indent);
  const parts: string[] = [];

  // Preserve the XML declaration (`<?xml ... ?>`) if the source had one.
  // DOMParser doesn't include the declaration in `doc.childNodes`, so we
  // sniff the source text.
  const declMatch = /^<\?xml[^?]*\?>/.exec(trimmed);
  if (declMatch) {
    parts.push(declMatch[0]);
  }

  for (let i = 0; i < doc.childNodes.length; i += 1) {
    const child = doc.childNodes[i];
    if (!child) continue;
    const rendered = serializeNode(child, 0, unit);
    if (rendered.length > 0) parts.push(rendered);
  }

  return { output: parts.join('\n'), error: null, errorLine: null };
}

export function minifyXml(raw: string): XmlFormatResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { output: '', error: null, errorLine: null };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    const detail = parserError.textContent?.trim() ?? 'Invalid XML';
    const lineMatch = /line\s*[:=]?\s*(\d+)/i.exec(detail);
    const line = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : null;
    const firstLine = detail.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? 'Invalid XML';
    return {
      output: '',
      error: firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine,
      errorLine: Number.isFinite(line) ? line : null,
    };
  }

  return { output: minifyTree(doc), error: null, errorLine: null };
}
