import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'retirement',
  name: 'Retirement Calculator',
  description: 'Project portfolio growth and check the 4% withdrawal rule.',
  longDescription:
    'Enter current age, target retirement age, current savings, monthly ' +
    'contribution, and expected return. Get a deterministic projection plus a ' +
    '4% rule check labeled as a heuristic, not a forecast.',
  category: 'finance',
  tags: [
    'retirement',
    'fire',
    'portfolio',
    '401k',
    'ira',
    'roth',
    'pension',
    'savings',
    '4% rule',
    'withdrawal',
    'compound',
  ],
  icon: 'piggy-bank',
  tier: 'pro',
  requiresBackend: false,
  // Form-input finance calculator: no v1 history drawer.
  historyEligible: false,
};
