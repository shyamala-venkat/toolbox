import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-split',
  name: 'PDF Split',
  description: 'Split a PDF into multiple files by page range',
  longDescription:
    'Upload a PDF, choose page ranges or split every N pages, and download ' +
    'the result. Multiple outputs are bundled into a ZIP. Runs entirely in your browser.',
  category: 'pdf-tools',
  tags: ['pdf', 'split', 'extract', 'pages', 'range', 'separate'],
  icon: 'scissors',
  tier: 'pro',
  requiresBackend: false,
};
