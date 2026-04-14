import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'barcode-gen',
  name: 'Barcode Generator',
  description: 'Generate barcodes in CODE128, UPC, EAN, CODE39, and ITF14 formats',
  longDescription:
    'Enter text or a number and generate a barcode in multiple industry-standard formats. ' +
    'Customize width, height, font size, and toggle text display. Download as PNG or SVG. ' +
    'Runs entirely on your machine.',
  category: 'generators',
  tags: ['barcode', 'generate', 'code128', 'upc', 'ean', 'scan', 'label'],
  icon: 'scan',
  tier: 'free',
  requiresBackend: false,
};
