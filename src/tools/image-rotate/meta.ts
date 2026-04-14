import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-rotate',
  name: 'Image Rotate & Flip',
  description: 'Rotate and flip images with cumulative transforms',
  longDescription:
    'Upload an image and apply rotations (90 CW, 90 CCW, 180) and flips (horizontal, ' +
    'vertical) that stack cumulatively. Live preview updates instantly. Download the ' +
    'transformed result as PNG. All processing runs locally via the HTML Canvas API.',
  category: 'image-tools',
  tags: ['image', 'rotate', 'flip', 'mirror', 'turn', 'orientation'],
  icon: 'rotate-cw',
  tier: 'free',
  requiresBackend: false,
};
