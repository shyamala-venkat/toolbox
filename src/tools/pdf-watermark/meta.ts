import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-watermark',
  name: 'PDF Watermark',
  description: 'Add a text watermark to every page of a PDF',
  longDescription:
    'Upload a PDF and overlay a text watermark on every page. Customize text, font size, ' +
    'color, opacity, rotation, and position. Uses pdf-lib — runs entirely on your machine.',
  category: 'pdf-tools',
  tags: ['pdf', 'watermark', 'stamp', 'text', 'overlay', 'protect', 'copyright'],
  icon: 'stamp',
  tier: 'pro',
  requiresBackend: false,
};
