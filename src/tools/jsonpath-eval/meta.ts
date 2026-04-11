import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'jsonpath-eval',
  name: 'JSON Path Evaluator',
  description: 'Evaluate JSONPath expressions against JSON data with live results',
  longDescription:
    'Paste JSON data and a JSONPath expression to instantly see matched results. ' +
    'Supports the full JSONPath spec including filters, wildcards, and recursive descent. ' +
    'Includes a library of common expressions. Runs entirely in your browser.',
  category: 'converters',
  tags: ['json', 'jsonpath', 'query', 'filter', 'evaluate', 'path', 'data'],
  icon: 'search',
  tier: 'pro',
  requiresBackend: false,
};
