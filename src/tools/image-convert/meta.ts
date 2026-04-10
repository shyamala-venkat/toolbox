import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-convert',
  name: 'Image Format Convert',
  description: 'Convert images between PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO',
  longDescription:
    'Convert images between all major formats with optional quality control for ' +
    'lossy formats. Supports PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO. ' +
    'HEIC/AVIF support is planned for a future update. All processing runs locally.',
  category: 'image-tools',
  tags: ['image', 'convert', 'format', 'png', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'ico'],
  icon: 'repeat',
  tier: 'free',
  requiresBackend: true,
};

export const TARGET_FORMATS = [
  { value: 'png', label: 'PNG', lossy: false },
  { value: 'jpg', label: 'JPEG', lossy: true },
  { value: 'webp', label: 'WebP', lossy: true },
  { value: 'bmp', label: 'BMP', lossy: false },
  { value: 'gif', label: 'GIF', lossy: false },
  { value: 'tiff', label: 'TIFF', lossy: false },
  { value: 'ico', label: 'ICO', lossy: false },
] as const;

export type TargetFormat = (typeof TARGET_FORMATS)[number]['value'];
