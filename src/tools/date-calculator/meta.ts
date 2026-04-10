import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'date-calculator',
  name: 'Date Calculator',
  description: 'Calculate differences between dates or add/subtract days, weeks, months, and years',
  longDescription:
    'Two modes: find the difference between two dates (including business days), or add/subtract a ' +
    'duration from a date. Shows day of week, ISO week number, and detailed breakdowns.',
  category: 'calculators',
  tags: ['date', 'difference', 'add', 'subtract', 'business days', 'weekday', 'duration'],
  icon: 'calendar',
  tier: 'free',
  requiresBackend: false,
};
