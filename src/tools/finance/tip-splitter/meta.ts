import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'tip-splitter',
  name: 'Tip Splitter',
  description: 'Split a bill with tip across any number of people.',
  longDescription:
    'Enter the bill, tip percentage, and party size. Get the per-person amount instantly. ' +
    'Runs entirely on your machine — no inputs are saved or sent anywhere.',
  category: 'finance',
  tags: ['tip', 'bill', 'split', 'restaurant', 'gratuity', 'finance'],
  icon: 'receipt',
  tier: 'free',
  requiresBackend: false,
  // Form-input finance calculator: no v1 history drawer.
  historyEligible: false,
};
