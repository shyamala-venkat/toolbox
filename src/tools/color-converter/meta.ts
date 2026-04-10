import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'color-converter',
  name: 'Color Converter',
  description: 'Convert between HEX, RGB, HSL, HSB color formats',
  longDescription:
    'Convert colors between HEX, RGB, HSL, HSB/HSV, and CMYK with a live ' +
    'preview and WCAG contrast ratio checks against both white and black.',
  category: 'converters',
  tags: ['color', 'hex', 'rgb', 'hsl', 'hsb', 'hsv', 'palette', 'design', 'contrast', 'wcag'],
  icon: 'palette',
  tier: 'free',
  requiresBackend: false,
};
