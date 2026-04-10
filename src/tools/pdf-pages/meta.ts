import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-pages',
  name: 'PDF Page Manager',
  description: 'Rotate, delete, and reorder PDF pages visually',
  longDescription:
    'Upload a PDF and see page thumbnails. Select pages to rotate, delete, or drag to ' +
    'reorder, then save the modified PDF. Runs entirely in your browser — nothing leaves your machine.',
  category: 'pdf-tools',
  tags: ['pdf', 'pages', 'rotate', 'delete', 'reorder', 'rearrange', 'manage'],
  icon: 'layout-grid',
  tier: 'pro',
  requiresBackend: false,
};
