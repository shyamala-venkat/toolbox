import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'qr-code',
  name: 'QR Code Generator',
  description: 'Generate QR codes from text or URLs',
  longDescription:
    'Generate QR codes from arbitrary text or URLs with configurable error correction, size, ' +
    'and margin. Download as PNG or SVG. Generation runs entirely locally — your content never ' +
    'leaves your machine.',
  category: 'generators',
  tags: ['qr', 'qrcode', 'barcode', 'url', 'link', 'image', 'png', 'svg'],
  icon: 'qr-code',
  tier: 'pro',
  requiresBackend: false,
};
