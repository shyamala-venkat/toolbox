import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'pdf-merge',
  name: 'PDF Merge',
  description: 'Combine multiple PDFs into a single document',
  longDescription:
    'Drag-and-drop or select multiple PDF files, reorder them as needed, ' +
    'and merge into one PDF. Runs entirely in your browser — nothing leaves your machine.',
  category: 'pdf-tools',
  tags: ['pdf', 'merge', 'combine', 'join', 'concatenate'],
  icon: 'file-plus-2',
  tier: 'free',
  requiresBackend: false,
};
