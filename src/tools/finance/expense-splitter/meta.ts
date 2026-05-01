import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'expense-splitter',
  name: 'Expense Splitter',
  description: 'Split group expenses fairly. Who owes whom, calculated locally.',
  longDescription:
    'Add a list of expenses with who paid for what. Get back the minimum settlement ' +
    'transactions to make everyone even. Trip bills, shared rent, group dinners — all ' +
    'local, no accounts.',
  category: 'finance',
  tags: ['expense', 'split', 'settlement', 'group', 'trip', 'splitwise', 'iou'],
  icon: 'receipt',
  tier: 'free',
  requiresBackend: false,
  // Multi-row form input: no v1 history drawer.
  historyEligible: false,
};
