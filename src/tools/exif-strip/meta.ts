import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'exif-strip',
  name: 'EXIF Metadata Strip',
  description: 'View and strip EXIF metadata from images for privacy',
  longDescription:
    'Read EXIF metadata from images, highlighting sensitive fields like GPS ' +
    'coordinates and timestamps. Strip all metadata with a single click for privacy. ' +
    'Shows before/after size comparison. All processing runs locally.',
  category: 'image-tools',
  tags: ['exif', 'metadata', 'strip', 'privacy', 'gps', 'location', 'image'],
  icon: 'scan',
  tier: 'pro',
  requiresBackend: true,
};

/** EXIF tag prefixes that indicate sensitive/privacy-relevant data. */
export const SENSITIVE_TAG_PREFIXES = ['gps', 'datetime', 'date', 'time'];
