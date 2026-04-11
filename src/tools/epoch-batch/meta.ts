import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'epoch-batch',
  name: 'Epoch Batch Converter',
  description: 'Convert multiple Unix timestamps to human-readable dates at once',
  longDescription:
    'Paste multiple Unix timestamps (one per line) and see each converted to ISO 8601, ' +
    'local time, and relative time. Auto-detects seconds (10 digits) vs milliseconds ' +
    '(13 digits) per line. Copy all results as CSV or formatted text.',
  category: 'converters',
  tags: ['epoch', 'timestamp', 'batch', 'unix', 'convert', 'bulk', 'date'],
  icon: 'list',
  tier: 'pro',
  requiresBackend: false,
};
