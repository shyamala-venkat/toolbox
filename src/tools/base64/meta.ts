import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'base64',
  name: 'Base64 Encoder/Decoder',
  description: 'Encode and decode Base64 strings and files',
  longDescription:
    'Convert between text and Base64 with full UTF-8 support. Handles files ' +
    'up to 10 MB and supports the URL-safe alphabet.',
  category: 'encoders-decoders',
  tags: ['base64', 'encode', 'decode', 'binary'],
  icon: 'binary',
  tier: 'free',
  requiresBackend: false,
};
