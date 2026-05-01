import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'currency-converter',
  name: 'Currency Converter',
  description: 'Convert between 25 currencies using bundled rates. All local.',
  longDescription:
    'Convert any amount between 25 major currencies using a bundled snapshot of ' +
    'Federal Reserve H.10 rates. Refresh manually when you need newer numbers — ' +
    'your data never leaves your machine.',
  category: 'finance',
  tags: [
    'currency',
    'convert',
    'exchange',
    'rate',
    'forex',
    'usd',
    'eur',
    'gbp',
  ],
  icon: 'dollar-sign',
  tier: 'free',
  requiresBackend: true,
  // Reads bundled FX snapshot via IPC (commands::finance::get_finance_dataset).
};
