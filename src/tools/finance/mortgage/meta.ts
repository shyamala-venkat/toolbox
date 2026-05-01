import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'mortgage',
  name: 'Mortgage Calculator',
  description: 'Estimate monthly payment with property tax, insurance, and amortization.',
  longDescription:
    'Enter loan amount, rate, term, and optional property tax + homeowner\'s ' +
    'insurance. Get total monthly payment broken down by P&I and escrow, plus ' +
    'a full amortization schedule. Runs entirely on your machine.',
  category: 'finance',
  tags: [
    'mortgage',
    'home',
    'house',
    'loan',
    'amortization',
    'pmi',
    'escrow',
    'property',
    'tax',
    'insurance',
  ],
  icon: 'piggy-bank',
  tier: 'pro',
  requiresBackend: false,
  // Form-input finance calculator: no v1 history drawer.
  historyEligible: false,
};
