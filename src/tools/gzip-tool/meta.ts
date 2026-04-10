import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'gzip-tool',
  name: 'GZip Compress/Decompress',
  description: 'Compress and decompress text using gzip',
  longDescription:
    'Compress text to a base64-encoded gzip payload or decompress a base64 ' +
    'payload back to text. Uses the browser-native `CompressionStream` API — ' +
    'nothing leaves your machine.',
  category: 'encoders-decoders',
  tags: ['gzip', 'compress', 'decompress', 'archive', 'deflate'],
  icon: 'archive',
  tier: 'pro',
  requiresBackend: false,
};
