import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'paycheck',
  name: 'Paycheck Calculator',
  description: 'Estimate take-home pay after federal tax + FICA. Estimate only.',
  longDescription:
    'Enter gross pay, period, and filing status. Get estimated net pay after ' +
    'federal income tax + Social Security + Medicare. Federal only — excludes ' +
    'state, local, and pre-tax benefits.',
  category: 'finance',
  tags: [
    'paycheck',
    'salary',
    'take home',
    'net pay',
    'fica',
    'social security',
    'medicare',
    'w-2',
  ],
  icon: 'wallet',
  tier: 'pro',
  requiresBackend: true,
};
