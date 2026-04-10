import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'text-case',
  name: 'Text Case Converter',
  description: 'Convert between camelCase, snake_case, kebab-case, and more',
  longDescription:
    'Convert any identifier or sentence between 13 common cases at once. ' +
    'Handles existing camelCase, snake_case, kebab-case, dot.case, and plain ' +
    'prose as input.',
  category: 'text',
  tags: ['case', 'camel', 'snake', 'kebab', 'pascal', 'upper', 'lower', 'title', 'sentence'],
  icon: 'case-sensitive',
  tier: 'free',
  requiresBackend: false,
};
