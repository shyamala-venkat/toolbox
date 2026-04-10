import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'lorem-ipsum',
  name: 'Lorem Ipsum Generator',
  description: 'Generate placeholder text',
  longDescription:
    'Generate lorem ipsum placeholder text by paragraphs, sentences, words, or byte count. ' +
    'Everything runs locally with a fixed Latin word dictionary — no network, no external library.',
  category: 'generators',
  tags: ['lorem', 'ipsum', 'placeholder', 'dummy', 'text', 'fill'],
  icon: 'align-left',
  tier: 'free',
  requiresBackend: false,
};
