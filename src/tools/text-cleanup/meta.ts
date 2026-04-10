import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'text-cleanup',
  name: 'Text Cleanup',
  description: 'Trim whitespace, remove empty lines, strip HTML tags, and more',
  longDescription:
    'Clean up messy text pasted from emails, PDFs, or web pages. Toggle operations like trimming, ' +
    'deduplication, sorting, HTML stripping, and extra-space removal. All processing runs locally.',
  category: 'text',
  tags: ['cleanup', 'trim', 'whitespace', 'duplicate', 'sort', 'html', 'strip'],
  icon: 'eraser',
  tier: 'free',
  requiresBackend: false,
};
