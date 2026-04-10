import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'json-formatter',
  name: 'JSON Formatter',
  description: 'Format, validate, and minify JSON with syntax highlighting',
  longDescription:
    'Pretty-print or minify JSON, validate with precise error locations, ' +
    'and optionally sort keys. Runs entirely in your browser — nothing leaves your machine.',
  category: 'formatters',
  tags: ['json', 'format', 'beautify', 'minify', 'validate', 'pretty-print'],
  icon: 'braces',
  tier: 'free',
  requiresBackend: false,
  clipboardDetection: {
    patterns: [/^\s*[[{]/],
    priority: 10,
  },
};
