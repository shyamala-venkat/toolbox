import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'markdown-pdf',
  name: 'Markdown to PDF',
  description: 'Write Markdown and export it as a styled PDF document',
  longDescription:
    'Split-view editor with live preview. Write or paste Markdown, see it rendered in real time, ' +
    'then export as a clean, print-ready PDF with good typography, code blocks, and tables. ' +
    'Uses marked + DOMPurify — runs entirely on your machine.',
  category: 'text',
  tags: ['markdown', 'pdf', 'export', 'convert', 'document', 'print'],
  icon: 'file-text',
  tier: 'pro',
  requiresBackend: false,
};
