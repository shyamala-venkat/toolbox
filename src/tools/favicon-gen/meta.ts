import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'favicon-gen',
  name: 'Favicon Generator',
  description: 'Generate favicon sets from text, emoji, or uploaded images',
  longDescription:
    'Create a complete favicon set (16x16 through 192x192) from text/emoji with a custom ' +
    'background color, or by uploading an existing image. Preview all sizes and download ' +
    'them as a ZIP. All processing runs locally via the HTML Canvas API.',
  category: 'generators',
  tags: ['favicon', 'icon', 'generate', 'website', 'browser', 'tab'],
  icon: 'globe',
  tier: 'free',
  requiresBackend: false,
};
