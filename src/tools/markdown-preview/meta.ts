import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'markdown-preview',
  name: 'Markdown Preview',
  description: 'Write Markdown and see a live rendered preview',
  longDescription:
    'Paste or type Markdown and see a live, sanitized HTML preview. Supports GitHub Flavored ' +
    'Markdown — tables, task lists, strikethrough, fenced code blocks, and more. ' +
    'Runs entirely in your browser.',
  category: 'text',
  tags: ['markdown', 'preview', 'render', 'html', 'gfm', 'github'],
  icon: 'file-text',
  tier: 'pro',
  requiresBackend: false,
};
