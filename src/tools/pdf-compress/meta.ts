import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-compress',
  name: 'PDF Compress',
  description: 'Optimize PDF file size with object stream compression',
  longDescription:
    'Upload a PDF and re-encode it with object streams enabled. Typically reduces file ' +
    'size by 10-30%. For maximum compression, use a dedicated PDF compressor. ' +
    'Runs entirely in your browser — nothing leaves your machine.',
  category: 'pdf-tools',
  tags: ['pdf', 'compress', 'optimize', 'reduce', 'size', 'shrink'],
  icon: 'file-minus-2',
  tier: 'pro',
  requiresBackend: false,
};
