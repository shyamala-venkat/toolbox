import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'unit-converter',
  name: 'Unit Converter',
  description: 'Convert between length, weight, temperature, volume, speed, and more',
  longDescription:
    'Convert units across 10 categories: length, weight, temperature, volume, speed, data size, ' +
    'area, time, pressure, and energy. Live conversion as you type with formula display.',
  category: 'calculators',
  tags: ['unit', 'convert', 'length', 'weight', 'temperature', 'volume', 'speed', 'metric', 'imperial'],
  icon: 'ruler',
  tier: 'free',
  requiresBackend: false,
};
