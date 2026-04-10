import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-resize',
  name: 'Image Resize',
  description: 'Resize images by dimensions or percentage with aspect ratio lock',
  longDescription:
    'Resize any image to custom dimensions or a preset percentage. Maintains aspect ratio ' +
    'by default and supports PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO. All processing ' +
    'happens locally via the Rust backend — nothing leaves your machine.',
  category: 'image-tools',
  tags: ['image', 'resize', 'dimensions', 'scale', 'width', 'height', 'aspect-ratio'],
  icon: 'minimize-2',
  tier: 'free',
  requiresBackend: true,
};

export const PERCENTAGE_PRESETS = [
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 100, label: '100%' },
  { value: 150, label: '150%' },
  { value: 200, label: '200%' },
] as const;

export const OUTPUT_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'bmp', label: 'BMP' },
  { value: 'gif', label: 'GIF' },
  { value: 'tiff', label: 'TIFF' },
  { value: 'ico', label: 'ICO' },
] as const;
