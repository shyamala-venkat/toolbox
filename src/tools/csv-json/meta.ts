import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'csv-json',
  name: 'CSV ↔ JSON',
  description: 'Convert between CSV and JSON formats',
  longDescription:
    'Convert CSV to JSON arrays of objects or JSON arrays back to CSV. Auto-detects ' +
    'input direction, configurable headers, and pretty-print. Uses PapaParse for ' +
    'robust parsing. Runs entirely in your browser.',
  category: 'file-tools',
  tags: ['csv', 'json', 'convert', 'parse', 'table', 'data'],
  icon: 'file-spreadsheet',
  tier: 'pro',
  requiresBackend: false,
};
