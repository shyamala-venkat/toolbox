import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'json-to-typescript',
  name: 'JSON to TypeScript',
  description: 'Generate TypeScript interfaces from JSON data',
  longDescription:
    'Paste a JSON payload and instantly get TypeScript interface or type definitions. ' +
    'Handles nested objects, arrays, mixed-type arrays, and null values. ' +
    'Customizable root name and interface/type output. Runs entirely in your browser.',
  category: 'converters',
  tags: ['json', 'typescript', 'interface', 'type', 'generate', 'convert', 'ts'],
  icon: 'file-code',
  tier: 'pro',
  requiresBackend: false,
};
