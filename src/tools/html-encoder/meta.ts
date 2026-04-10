import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'html-encoder',
  name: 'HTML Encoder/Decoder',
  description: 'Encode HTML entities and decode entity references',
  longDescription:
    'Escape HTML-unsafe characters (&, <, >, ", \') as named entities and ' +
    'decode named or numeric entity references back to text. Optionally ' +
    'encode every non-ASCII character as a numeric reference.',
  category: 'encoders-decoders',
  tags: ['html', 'entities', 'encode', 'decode', 'escape'],
  icon: 'code',
  tier: 'pro',
  requiresBackend: false,
};
