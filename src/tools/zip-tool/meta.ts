import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'zip-tool',
  name: 'ZIP Tool',
  description: 'Create and extract ZIP archives entirely in your browser',
  longDescription:
    'Create ZIP archives from multiple files or extract contents from existing ZIPs. ' +
    'Drag-and-drop support, file listing with sizes, and individual file extraction. ' +
    'Uses fflate — runs entirely on your machine.',
  category: 'file-tools',
  tags: ['zip', 'archive', 'compress', 'extract', 'unzip', 'bundle', 'package'],
  icon: 'archive',
  tier: 'free',
  requiresBackend: false,
};
