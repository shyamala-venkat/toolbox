import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'number-base',
  name: 'Number Base Converter',
  description: 'Convert numbers between binary, octal, decimal, and hex',
  longDescription:
    'Convert integers between binary, octal, decimal, and hexadecimal. ' +
    'Uses BigInt internally so arbitrarily large values stay exact. ' +
    'Signed input is supported in decimal.',
  category: 'converters',
  tags: ['binary', 'octal', 'decimal', 'hex', 'hexadecimal', 'base', 'radix', 'bigint'],
  icon: 'binary',
  tier: 'pro',
  requiresBackend: false,
};
