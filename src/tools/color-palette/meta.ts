import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'color-palette',
  name: 'Color Palette Generator',
  description: 'Generate complementary, analogous, triadic, split-complementary, and monochromatic palettes',
  longDescription:
    'Enter a hex color to generate five palette types: Complementary, Analogous, Triadic, ' +
    'Split-Complementary, and Monochromatic. Each palette shows five color swatches with hex ' +
    'values. Click any swatch to copy its hex. Pure HSL math — no network calls.',
  category: 'converters',
  tags: ['color', 'palette', 'generate', 'complementary', 'analogous', 'triadic', 'scheme'],
  icon: 'palette',
  tier: 'free',
  requiresBackend: false,
};
