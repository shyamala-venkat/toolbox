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
  // --- New non-technical categories (show first for broader audience) ---
  {
    id: 'pdf-tools',
    label: 'PDF Tools',
    description: 'Merge, split, compress, and convert PDFs — all offline.',
    icon: 'file-text',
  },
  {
    id: 'image-tools',
    label: 'Image Tools',
    description: 'Resize, compress, convert, and clean up images.',
    icon: 'image',
  },
  {
    id: 'file-tools',
    label: 'File Tools',
    description: 'Convert, compress, and manage files — CSV, ZIP, DOCX.',
    icon: 'folder',
  },
  {
    id: 'calculators',
    label: 'Calculators',
    description: 'Units, dates, and everyday number crunching.',
    icon: 'calculator',
  },
  // --- Renamed existing categories (friendlier labels) ---
  {
    id: 'text',
    label: 'Writing & Text',
    description: 'Word count, diff, cleanup, regex — everyday text utilities.',
    icon: 'type',
  },
  {
    id: 'generators',
    label: 'Generators',
    description: 'Passwords, QR codes, UUIDs, lorem ipsum, and more.',
    icon: 'sparkles',
  },
  {
    id: 'crypto',
    label: 'Security & Hashing',
    description: 'Hashes, checksums, and verification tools.',
    icon: 'shield',
  },
  {
    id: 'encoders-decoders',
    label: 'Text Converters',
    description: 'Base64, URL, HTML entities, JWT, GZip — encode and decode.',
    icon: 'binary',
  },
  {
    id: 'formatters',
    label: 'Data Formatters',
    description: 'Pretty-print and validate JSON, SQL, XML, and YAML.',
    icon: 'braces',
  },
  {
    id: 'converters',
    label: 'Data Tools',
    description: 'Color spaces, number bases, timestamps — transform values.',
    icon: 'shuffle',
  },
  // --- Kept for future use (no tools yet) ---
  {
    id: 'media',
    label: 'Media',
    description: 'Audio and video helpers.',
    icon: 'image',
  },
  {
    id: 'network',
    label: 'Network',
    description: 'IP, DNS, HTTP, and other network diagnostics.',
    icon: 'globe',
  },
];

export const getCategoryMeta = (id: ToolCategory): ToolCategoryMeta | undefined =>
  TOOL_CATEGORIES.find((c) => c.id === id);
