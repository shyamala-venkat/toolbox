import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'backslash-escape',
  name: 'Backslash Escape/Unescape',
  description: 'Escape and unescape special characters for different contexts',
  longDescription:
    'Escape or unescape special characters for JSON strings, regular expressions, ' +
    'HTML, URLs, or general use. Auto-processes as you type with context-aware ' +
    'character handling. Runs entirely in your browser.',
  category: 'encoders-decoders',
  tags: ['escape', 'unescape', 'backslash', 'special', 'characters', 'json', 'regex', 'html', 'url'],
  icon: 'shield',
  tier: 'free',
  requiresBackend: false,
};
