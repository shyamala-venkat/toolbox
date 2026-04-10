import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-to-image',
  name: 'PDF to Image',
  description: 'Convert PDF pages to PNG or JPG images',
  longDescription:
    'Upload a PDF, choose the output format (PNG or JPG), scale, and page range, ' +
    'then preview and download images. Multiple pages are bundled into a ZIP. ' +
    'Runs entirely in your browser — nothing leaves your machine.',
  category: 'pdf-tools',
  tags: ['pdf', 'image', 'png', 'jpg', 'convert', 'export', 'screenshot'],
  icon: 'image',
  tier: 'pro',
  requiresBackend: false,
};
