import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'placeholder-image',
  name: 'Placeholder Image Generator',
  description: 'Generate placeholder images with custom dimensions, colors, and text',
  longDescription:
    'Create placeholder images with configurable width, height, background color, text, and text ' +
    'color. Live canvas preview with one-click PNG download. Includes presets for common sizes ' +
    '(Instagram, OG Image, YouTube, Blog). Everything renders locally on a canvas element.',
  category: 'generators',
  tags: ['placeholder', 'image', 'generate', 'dummy', 'size', 'preview'],
  icon: 'image',
  tier: 'free',
  requiresBackend: false,
};
