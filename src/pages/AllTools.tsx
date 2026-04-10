import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { toolRegistry, searchTools } from '@/tools/registry';
import { TOOL_CATEGORIES } from '@/tools/categories';
import type { ToolCategory, ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';

export function AllTools() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategory | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim();
    const base = q ? searchTools(q) : toolRegistry;
    if (category === 'all') return base;
    return base.filter((t) => t.category === category);
  }, [query, category]);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-10">
      <header className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          All tools
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Browse every utility in the registry.
        </p>
      </header>

      <div className="mb-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          leadingIcon={<SearchIcon className="h-4 w-4" />}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <CategoryChip
          label="All"
          active={category === 'all'}
          onClick={() => setCategory('all')}
        />
        {TOOL_CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat.id}
            label={cat.label}
            active={category === cat.id}
            onClick={() => setCategory(cat.id)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="px-6 py-10 text-center text-sm"
          style={{
            color: 'var(--text-tertiary)',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px dashed var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {toolRegistry.length === 0
            ? 'No tools registered yet.'
            : 'No tools match your filters.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              onClick={() => navigate(`/tools/${tool.id}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface CategoryChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function CategoryChip({ label, active, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-7 px-3 text-xs font-medium transition-colors')}
      style={{
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-primary)'}`,
        borderRadius: 'var(--radius-sm)',
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

interface ToolRowProps {
  tool: ToolDefinition;
  onClick: () => void;
}

function ToolRow({ tool, onClick }: ToolRowProps) {
  const Icon = getToolIcon(tool.icon);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="tb-tool-card flex w-full items-center gap-3 px-4 py-3 text-left"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {tool.name}
          </span>
          <span className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {tool.description}
          </span>
        </div>
      </button>
    </li>
  );
}
