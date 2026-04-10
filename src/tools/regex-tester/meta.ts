import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'regex-tester',
  name: 'Regex Tester',
  description: 'Test regular expressions with real-time match highlighting',
  longDescription:
    'Test JavaScript regular expressions against sample input with live match highlighting. ' +
    'Supports match, replace, and split modes, all six flag toggles, named capture groups, ' +
    'and a library of common patterns. Execution runs in a sandboxed Web Worker with a ' +
    '5-second timeout to protect against catastrophic backtracking.',
  category: 'text',
  tags: ['regex', 'regexp', 'pattern', 'match', 'test', 'replace'],
  icon: 'regex',
  tier: 'pro',
  requiresBackend: false,
};
