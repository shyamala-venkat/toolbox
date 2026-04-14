import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'password-checker',
  name: 'Password Strength Checker',
  description: 'Analyze password entropy, crack time, and character set composition',
  longDescription:
    'Enter a password to see its entropy in bits, estimated crack time at various attack speeds, ' +
    'character set analysis, and a strength rating. Includes a top-100 common passwords check. ' +
    'Nothing is logged or transmitted — analysis runs entirely in your browser.',
  category: 'crypto',
  tags: ['password', 'strength', 'security', 'entropy', 'crack', 'checker'],
  icon: 'shield-check',
  tier: 'free',
  requiresBackend: false,
};
