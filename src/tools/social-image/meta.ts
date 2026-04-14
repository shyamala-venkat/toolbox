import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'social-image',
  name: 'Social Media Resizer',
  description: 'Resize images to exact dimensions for every major social platform',
  longDescription:
    'Select a platform preset — Instagram, Twitter/X, LinkedIn, Facebook, YouTube, or TikTok — ' +
    'and resize any image to the exact required dimensions. All processing happens locally via ' +
    'the Rust backend. Supports PNG, JPEG, WebP, BMP, GIF, TIFF, and ICO.',
  category: 'image-tools',
  tags: ['social', 'media', 'resize', 'instagram', 'twitter', 'linkedin', 'facebook', 'youtube', 'tiktok'],
  icon: 'smartphone',
  tier: 'free',
  requiresBackend: true,
};

export interface SocialPreset {
  id: string;
  platform: string;
  label: string;
  width: number;
  height: number;
}

export const SOCIAL_PRESETS: SocialPreset[] = [
  { id: 'ig-post', platform: 'Instagram', label: 'Post', width: 1080, height: 1080 },
  { id: 'ig-story', platform: 'Instagram', label: 'Story', width: 1080, height: 1920 },
  { id: 'twitter-header', platform: 'Twitter/X', label: 'Header', width: 1500, height: 500 },
  { id: 'linkedin-banner', platform: 'LinkedIn', label: 'Banner', width: 1584, height: 396 },
  { id: 'fb-cover', platform: 'Facebook', label: 'Cover', width: 820, height: 312 },
  { id: 'yt-thumb', platform: 'YouTube', label: 'Thumbnail', width: 1280, height: 720 },
  { id: 'tiktok', platform: 'TikTok', label: 'Video', width: 1080, height: 1920 },
];
