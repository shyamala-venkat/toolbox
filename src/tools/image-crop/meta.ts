import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-crop',
  name: 'Image Crop',
  description: 'Crop images with draggable selection and aspect ratio presets',
  longDescription:
    'Upload an image and define a crop area by dragging corners and edges. Choose from ' +
    'preset aspect ratios (Free, 1:1, 16:9, 4:3, 3:2) or drag freely. Download the ' +
    'cropped result as PNG. All processing runs locally via the HTML Canvas API.',
  category: 'image-tools',
  tags: ['image', 'crop', 'cut', 'trim', 'aspect', 'ratio'],
  icon: 'scissors',
  tier: 'free',
  requiresBackend: false,
};
