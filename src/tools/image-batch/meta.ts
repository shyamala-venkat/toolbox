import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'image-batch',
  name: 'Image Batch Processor',
  description: 'Apply resize, compress, convert, or strip EXIF to multiple images at once',
  longDescription:
    'Process multiple images in bulk with a single operation. Choose from resize, compress, ' +
    'convert format, or strip EXIF metadata. Per-file progress tracking with error resilience ' +
    '— failed files are skipped and reported at the end. All processing runs locally.',
  category: 'image-tools',
  tags: ['image', 'batch', 'bulk', 'resize', 'compress', 'convert', 'exif', 'multiple'],
  icon: 'images',
  tier: 'pro',
  requiresBackend: true,
};

export type BatchOperation = 'resize' | 'compress' | 'convert' | 'strip-exif';

export const BATCH_OPERATIONS = [
  { value: 'resize' as const, label: 'Resize' },
  { value: 'compress' as const, label: 'Compress' },
  { value: 'convert' as const, label: 'Convert Format' },
  { value: 'strip-exif' as const, label: 'Strip EXIF' },
];
