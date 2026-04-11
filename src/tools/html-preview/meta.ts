import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'html-preview',
  name: 'HTML Preview',
  description: 'Write HTML and see a live rendered preview',
  longDescription:
    'Paste or type HTML and see a live, sanitized preview. Optionally view the ' +
    'source code alongside the rendered output. All HTML is sanitized through ' +
    'DOMPurify before rendering. Runs entirely in your browser.',
  category: 'text',
  tags: ['html', 'preview', 'render', 'live', 'sandbox'],
  icon: 'eye',
  tier: 'pro',
  requiresBackend: false,
};
