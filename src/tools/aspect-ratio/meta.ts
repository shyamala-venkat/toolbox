import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'aspect-ratio',
  name: 'Aspect Ratio Calculator',
  description: 'Calculate and convert aspect ratios from dimensions or find missing dimensions from a ratio',
  longDescription:
    'Two modes: enter width and height to find the simplified ratio and matching presets, or enter ' +
    'a ratio and one dimension to calculate the other. Uses GCD for accurate simplification. ' +
    'All math runs locally.',
  category: 'calculators',
  tags: ['aspect', 'ratio', 'width', 'height', 'resize', 'dimension', 'proportion'],
  icon: 'scale',
  tier: 'free',
  requiresBackend: false,
};
