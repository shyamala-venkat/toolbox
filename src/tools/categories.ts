import type { ToolCategory } from './types';

/**
 * Display metadata for every `ToolCategory`.
 *
 * Kept alongside the registry but in its own file so Phase 3 tool additions
 * never need to touch it. Order here is the order the sidebar renders sections.
 */
export interface ToolCategoryMeta {
  id: ToolCategory;
  label: string;
  description: string;
  icon: string;
}

export const TOOL_CATEGORIES: ToolCategoryMeta[] = [
  {
    id: 'encoders-decoders',
    label: 'Encoders & Decoders',
    description: 'Base64, URL, HTML, JWT, hex — encode and decode with a click.',
    icon: 'binary',
  },
  {
    id: 'formatters',
    label: 'Formatters',
    description: 'Pretty-print and lint JSON, YAML, SQL, and more.',
    icon: 'braces',
  },
  {
    id: 'generators',
    label: 'Generators',
    description: 'UUIDs, passwords, lorem ipsum, and other scaffolding values.',
    icon: 'sparkles',
  },
  {
    id: 'converters',
    label: 'Converters',
    description: 'Case, units, timestamps, color spaces — transform values.',
    icon: 'shuffle',
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Diff, search, word count, regex — everyday text utilities.',
    icon: 'type',
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Image, audio, and video helpers.',
    icon: 'image',
  },
  {
    id: 'network',
    label: 'Network',
    description: 'IP, DNS, HTTP, and other network diagnostics.',
    icon: 'globe',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    description: 'Hashes, HMAC, RSA, and signing utilities.',
    icon: 'shield',
  },
];

export const getCategoryMeta = (id: ToolCategory): ToolCategoryMeta | undefined =>
  TOOL_CATEGORIES.find((c) => c.id === id);
