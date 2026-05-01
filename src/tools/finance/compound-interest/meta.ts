import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'compound-interest',
  name: 'Compound Interest',
  description:
    'Project investment growth with compound interest and contributions.',
  longDescription:
    'Enter starting principal, annual return, monthly contribution, and time ' +
    'horizon. See projected final value, total contributed, and earnings — ' +
    'with a year-by-year chart. All local.',
  category: 'finance',
  tags: [
    'compound',
    'interest',
    'investment',
    'savings',
    'growth',
    'returns',
  ],
  icon: 'trending-up',
  tier: 'free',
  requiresBackend: false,
};
