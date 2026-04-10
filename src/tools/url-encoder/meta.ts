import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'url-encoder',
  name: 'URL Encoder/Decoder',
  description: 'Encode and decode URLs and URL components',
  longDescription:
    'Percent-encode or decode URLs and URL components. Switch between ' +
    '`encodeURIComponent` for query parameters and `encodeURI` for whole ' +
    'URLs. Runs entirely in your browser.',
  category: 'encoders-decoders',
  tags: ['url', 'encode', 'decode', 'percent', 'uri', 'query'],
  icon: 'link-2',
  tier: 'free',
  requiresBackend: false,
};
