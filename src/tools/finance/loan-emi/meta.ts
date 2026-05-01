import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'loan-emi',
  name: 'Loan / EMI Calculator',
  description: 'Calculate monthly payment and amortization for any loan.',
  longDescription:
    'Enter principal, annual interest rate, and term in months. Get monthly ' +
    'payment, total interest, and a full amortization schedule with chart. ' +
    'Runs entirely on your machine.',
  category: 'finance',
  tags: [
    'loan',
    'emi',
    'mortgage',
    'amortization',
    'interest',
    'payment',
    'monthly',
  ],
  icon: 'piggy-bank',
  tier: 'free',
  requiresBackend: false,
  // Form-input finance calculator: no v1 history drawer.
  historyEligible: false,
};
