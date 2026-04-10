import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-compress',
  name: 'Image Compress',
  description: 'Compress images to reduce file size with adjustable quality',
  longDescription:
    'Reduce image file size with a quality slider for JPEG and WebP. PNG files are ' +
    're-saved losslessly. Shows before/after size comparison with savings percentage. ' +
    'All processing runs locally via the Rust backend.',
  category: 'image-tools',
  tags: ['image', 'compress', 'optimize', 'quality', 'reduce', 'file-size'],
  icon: 'file-down',
  tier: 'free',
  requiresBackend: true,
};
