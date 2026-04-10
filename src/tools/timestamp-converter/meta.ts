import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'timestamp-converter',
  name: 'Timestamp Converter',
  description: 'Convert between Unix timestamps, ISO 8601, and human-readable dates',
  longDescription:
    'Auto-detects Unix seconds, Unix milliseconds, ISO 8601, and natural language dates. ' +
    'Shows every common representation side-by-side and supports any IANA timezone.',
  category: 'converters',
  tags: ['timestamp', 'unix', 'epoch', 'date', 'time', 'iso8601', 'convert'],
  icon: 'clock',
  tier: 'free',
  requiresBackend: false,
  clipboardDetection: {
    // 10 digits → seconds, 13 digits → milliseconds.
    patterns: [/^\s*\d{10}(\d{3})?\s*$/],
    priority: 8,
  },
};
