import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'csv-viewer',
  name: 'CSV Viewer & Editor',
  description: 'View, sort, filter, edit, and export CSV files',
  longDescription:
    'Drop a CSV file or paste CSV text to view it as a sortable, filterable table. Edit cells in-place ' +
    'and export the result. Uses PapaParse for robust parsing with delimiter auto-detection.',
  category: 'file-tools',
  tags: ['csv', 'spreadsheet', 'table', 'editor', 'sort', 'filter', 'export'],
  icon: 'file-spreadsheet',
  tier: 'pro',
  requiresBackend: false,
};
