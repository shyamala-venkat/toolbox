import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'uuid-generator',
  name: 'UUID Generator',
  description: 'Generate UUIDs in v1, v4, and v7 formats',
  longDescription:
    'Generate cryptographically random or time-ordered UUIDs in v1, v4, ' +
    'and v7 formats. Up to 100 at a time, with hyphen and case options.',
  category: 'generators',
  tags: ['uuid', 'guid', 'identifier', 'random', 'v1', 'v4', 'v7'],
  icon: 'fingerprint',
  tier: 'free',
  requiresBackend: false,
};
