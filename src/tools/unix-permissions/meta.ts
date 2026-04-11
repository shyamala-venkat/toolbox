import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'unix-permissions',
  name: 'Unix Permissions Calculator',
  description: 'Convert between octal, symbolic, and checkbox representations of file permissions',
  longDescription:
    'Edit Unix file permissions via octal input (e.g. 755), a checkbox grid, or ' +
    'symbolic display (rwxr-xr-x). All representations stay in sync as you edit. ' +
    'Shows the corresponding chmod command.',
  category: 'calculators',
  tags: ['unix', 'permissions', 'chmod', 'octal', 'rwx', 'linux', 'file'],
  icon: 'lock',
  tier: 'free',
  requiresBackend: false,
};
