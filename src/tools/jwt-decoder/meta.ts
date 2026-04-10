import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'jwt-decoder',
  name: 'JWT Decoder',
  description: 'Decode and inspect JWT tokens (header, payload, expiry)',
  longDescription:
    'Decode JSON Web Tokens and inspect the header, payload, and signature. ' +
    'Recognises standard claims (exp, iat, nbf, iss, aud, sub) and shows ' +
    'validity windows in human time. Signature verification requires a secret ' +
    'and is intentionally not performed locally.',
  category: 'encoders-decoders',
  tags: ['jwt', 'token', 'decode', 'json', 'auth', 'jose'],
  icon: 'key-round',
  tier: 'free',
  requiresBackend: false,
  clipboardDetection: {
    patterns: [/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/],
    priority: 9,
  },
};
