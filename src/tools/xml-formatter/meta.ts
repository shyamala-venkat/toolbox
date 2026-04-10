import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'xml-formatter',
  name: 'XML Formatter',
  description: 'Format, minify, and validate XML',
  longDescription:
    'Pretty-print or minify XML documents with validation. Uses the browser ' +
    'DOMParser so nothing leaves your machine, and renders output into a ' +
    'plain text area (never injected into the live DOM).',
  category: 'formatters',
  tags: ['xml', 'format', 'beautify', 'minify', 'validate'],
  icon: 'code-xml',
  tier: 'pro',
  requiresBackend: false,
};
