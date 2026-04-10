import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'password-gen',
  name: 'Password Generator',
  description: 'Generate strong, customizable passwords',
  longDescription:
    'Generate cryptographically strong passwords with configurable length, character sets, ' +
    'and ambiguous-character filtering. Bulk-generate up to 50 at once with an entropy-based ' +
    'strength meter. Passwords are ephemeral — nothing is ever written to disk or logs.',
  category: 'generators',
  tags: ['password', 'generate', 'random', 'secure', 'strength'],
  icon: 'key',
  tier: 'pro',
  requiresBackend: false,
};
