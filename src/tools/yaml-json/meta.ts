import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'yaml-json',
  name: 'YAML ↔ JSON',
  description: 'Convert between YAML and JSON formats',
  longDescription:
    'Convert between YAML and JSON with auto-detected direction. Uses the ' +
    "safe JSON schema so YAML's merge-key syntax can't smuggle prototype " +
    'pollution into your objects.',
  category: 'converters',
  tags: ['yaml', 'json', 'convert', 'parse', 'serialize'],
  icon: 'file-cog',
  tier: 'pro',
  requiresBackend: false,
};
