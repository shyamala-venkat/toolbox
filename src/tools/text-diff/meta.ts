import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'text-diff',
  name: 'Text Diff',
  description: 'Compare two text snippets side by side or unified',
  longDescription:
    'Visual diff between two text snippets with line, word, or character granularity. ' +
    'Side-by-side and unified views, optional whitespace-insensitive comparison. ' +
    'Runs entirely in your browser.',
  category: 'text',
  tags: ['diff', 'compare', 'merge', 'difference', 'changes'],
  icon: 'diff',
  tier: 'pro',
  requiresBackend: false,
};
