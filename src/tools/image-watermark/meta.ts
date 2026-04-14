import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-watermark',
  name: 'Image Watermark',
  description: 'Add text watermarks to images with position, opacity, and rotation controls',
  longDescription:
    'Upload an image and overlay a customizable text watermark. Control font size, color, ' +
    'opacity, position (9-point grid), and rotation angle. Live preview on canvas. Download ' +
    'the watermarked result as PNG. All processing runs locally via the HTML Canvas API.',
  category: 'image-tools',
  tags: ['image', 'watermark', 'text', 'overlay', 'protect', 'copyright'],
  icon: 'stamp',
  tier: 'pro',
  requiresBackend: false,
};
