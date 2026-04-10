import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'word-counter',
  name: 'Word & Character Counter',
  description: 'Count words, characters, sentences, paragraphs, and estimate reading time',
  longDescription:
    'Paste or type any text to get real-time statistics: words, characters (with and without spaces), ' +
    'sentences, paragraphs, lines, estimated reading time, and speaking time. Everything runs locally.',
  category: 'text',
  tags: ['word', 'count', 'character', 'sentence', 'paragraph', 'reading time', 'speaking time'],
  icon: 'pilcrow',
  tier: 'free',
  requiresBackend: false,
};
