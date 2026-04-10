import type { ToolMeta } from '@/tools/types';

export const meta: ToolMeta = {
  id: 'sql-formatter',
  name: 'SQL Formatter',
  description: 'Format SQL queries with dialect support',
  longDescription:
    'Pretty-print SQL queries with dialect-aware keyword handling. Supports ' +
    'MySQL, PostgreSQL, SQLite, T-SQL, BigQuery, Snowflake, and MariaDB. Runs ' +
    'entirely in your browser — nothing leaves your machine.',
  category: 'formatters',
  tags: ['sql', 'format', 'beautify', 'mysql', 'postgresql', 'sqlite', 'database'],
  icon: 'database',
  tier: 'pro',
  requiresBackend: false,
};

export const SQL_DIALECTS = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'tsql', label: 'T-SQL' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'mariadb', label: 'MariaDB' },
] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number]['value'];

export const SQL_DIALECT_IDS = SQL_DIALECTS.map((d) => d.value) as readonly SqlDialect[];
