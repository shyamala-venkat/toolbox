import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'screen-ruler',
  name: 'Screen Ruler',
  description: 'Measure pixel distances by dragging two handles on screen',
  longDescription:
    'A visual pixel measurement tool. Drag two handles to measure horizontal, vertical, ' +
    'and diagonal distances in pixels. Useful for checking spacing, sizing, and alignment ' +
    'in UI design work.',
  category: 'calculators',
  tags: ['ruler', 'pixel', 'measure', 'distance', 'screen', 'dimension', 'size'],
  icon: 'ruler',
  tier: 'free',
  requiresBackend: false,
};
