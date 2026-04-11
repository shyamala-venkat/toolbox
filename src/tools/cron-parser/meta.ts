import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'cron-parser',
  name: 'Cron Expression Parser',
  description: 'Parse cron expressions into human-readable schedules with next run times',
  longDescription:
    'Enter a standard 5-field or 6-field (with seconds) cron expression and see its ' +
    'human-readable description plus the next 10 scheduled execution times. ' +
    'Includes common presets for quick start. Runs entirely in your browser.',
  category: 'calculators',
  tags: ['cron', 'schedule', 'crontab', 'timer', 'job', 'recurring'],
  icon: 'timer',
  tier: 'free',
  requiresBackend: false,
};
