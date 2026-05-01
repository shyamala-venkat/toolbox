import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'tax-bracket',
  name: 'Tax Bracket Estimator',
  description: 'Estimate US federal income tax for the bundled tax year. Estimate only.',
  longDescription:
    'Enter your filing status and gross income. See estimated federal income ' +
    'tax owed, effective rate, and marginal rate using bundled IRS bracket ' +
    'data. Estimate only — not tax advice.',
  category: 'finance',
  tags: [
    'tax',
    'bracket',
    'income',
    'irs',
    'federal',
    'effective rate',
    'marginal',
  ],
  icon: 'percent',
  tier: 'pro',
  requiresBackend: true,
};
