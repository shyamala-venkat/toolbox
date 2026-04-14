import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, Shield } from 'lucide-react';
import { toolRegistry, searchTools, getToolById } from '@/tools/registry';
import { TOOL_CATEGORIES } from '@/tools/categories';
import type { ToolCategory, ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { useRecentTools } from '@/stores/toolStore';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/ui/Input';

// ─── Popular tools — editorial picks shown on the home screen ───────────────

const POPULAR_TOOL_IDS = [
  'pdf-merge',
  'image-resize',
  'qr-code',
  'password-checker',
  'zip-tool',
  'barcode-gen',
  'color-palette',
  'favicon-gen',
] as const;

// ─── Main component ─────────────────────────────────────────────────────────

export function Home() {
  const navigate = useNavigate();
  const recents = useRecentTools(6);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | null>(null);

  const searchResults = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return null;
    return searchTools(q);
  }, [debouncedQuery]);

  const isSearching = debouncedQuery.trim().length > 0;

  // Category → tool count, sorted descending, top 8 with > 0 tools
  const topCategories = useMemo(() => {
    const countMap = new Map<ToolCategory, number>();
    for (const tool of toolRegistry) {
      countMap.set(tool.category, (countMap.get(tool.category) ?? 0) + 1);
    }
    return TOOL_CATEGORIES.filter((cat) => (countMap.get(cat.id) ?? 0) > 0)
      .sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0))
      .slice(0, 8)
      .map((cat) => ({ ...cat, count: countMap.get(cat.id) ?? 0 }));
  }, []);

  const popularTools = useMemo(() => {
    const tools: ToolDefinition[] = [];
    for (const id of POPULAR_TOOL_IDS) {
      const tool = getToolById(id);
      if (tool) tools.push(tool);
    }
    return tools;
  }, []);

  const categoryTools = useMemo(() => {
    if (!selectedCategory) return [];
    return toolRegistry.filter((t) => t.category === selectedCategory);
  }, [selectedCategory]);

  const selectedCategoryMeta = selectedCategory
    ? TOOL_CATEGORIES.find((c) => c.id === selectedCategory)
    : null;

  const handleToolClick = (id: string) => navigate(`/tools/${id}`);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-10">
      {/* Search bar */}
      <section className="mb-8">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedCategory) setSelectedCategory(null);
          }}
          placeholder="What do you want to do? Try: merge pdf, resize image, generate qr code..."
          aria-label="Search tools"
          leadingIcon={<SearchIcon className="h-4 w-4" />}
        />
      </section>

      {isSearching ? (
        /* ── Search results ─────────────────────────────────────────────── */
        <section>
          <h2
            className="mb-4 text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {searchResults?.length ?? 0} result{searchResults?.length === 1 ? '' : 's'} for &ldquo;{debouncedQuery.trim()}&rdquo;
          </h2>
          {searchResults && searchResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {searchResults.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onClick={handleToolClick} />
              ))}
            </div>
          ) : (
            <EmptySearch />
          )}
        </section>
      ) : selectedCategory ? (
        /* ── Category drill-down ────────────────────────────────────────── */
        <section>
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: 'var(--accent)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to all
          </button>
          <h2
            className="mb-1 text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {selectedCategoryMeta?.label}
          </h2>
          <p
            className="mb-5 text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {selectedCategoryMeta?.description}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categoryTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onClick={handleToolClick} />
            ))}
          </div>
        </section>
      ) : (
        /* ── Default sections: recents, categories, popular, privacy ──── */
        <>
          {/* Recent tools */}
          {recents.length > 0 && (
            <section className="mb-10">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Recent
              </h2>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                role="list"
                style={{ scrollbarWidth: 'thin' }}
              >
                {recents.map((tool) => (
                  <RecentPill key={tool.id} tool={tool} onClick={handleToolClick} />
                ))}
              </div>
            </section>
          )}

          {/* Category cards */}
          {topCategories.length > 0 && (
            <section className="mb-10">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Categories
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {topCategories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    id={cat.id}
                    label={cat.label}
                    icon={cat.icon}
                    count={cat.count}
                    onClick={setSelectedCategory}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Popular tools */}
          {popularTools.length > 0 && (
            <section className="mb-10">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Popular Tools
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {popularTools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} onClick={handleToolClick} />
                ))}
              </div>
            </section>
          )}

          {/* Privacy badge */}
          <PrivacyBadge />
        </>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

interface RecentPillProps {
  tool: ToolDefinition;
  onClick: (id: string) => void;
}

function RecentPill({ tool, onClick }: RecentPillProps) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={() => onClick(tool.id)}
      className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '9999px',
        color: 'var(--text-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        e.currentTarget.style.borderColor = 'var(--border-primary)';
      }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0"
        style={{
          backgroundColor: 'var(--accent)',
          borderRadius: '9999px',
        }}
        aria-hidden="true"
      />
      <span className="truncate">{tool.name}</span>
    </button>
  );
}

interface CategoryCardProps {
  id: ToolCategory;
  label: string;
  icon: string;
  count: number;
  onClick: (id: ToolCategory) => void;
}

function CategoryCard({ id, label, icon, count, onClick }: CategoryCardProps) {
  const Icon = getToolIcon(icon);
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className="tb-tool-card flex flex-col items-start gap-3 px-4 py-4 text-left transition-colors"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center"
        style={{
          backgroundColor: 'var(--accent-subtle)',
          color: 'var(--accent)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {count} tool{count === 1 ? '' : 's'}
        </div>
      </div>
    </button>
  );
}

interface ToolCardProps {
  tool: ToolDefinition;
  onClick: (id: string) => void;
}

function ToolCard({ tool, onClick }: ToolCardProps) {
  const Icon = getToolIcon(tool.icon);
  return (
    <button
      type="button"
      onClick={() => onClick(tool.id)}
      className="tb-tool-card flex flex-col items-start gap-2 px-4 py-4 text-left transition-colors"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <TierBadge tier={tool.tier} />
      </div>
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {tool.name}
      </div>
      <div
        className="line-clamp-1 text-xs leading-snug"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {tool.description}
      </div>
    </button>
  );
}

function TierBadge({ tier }: { tier: 'free' | 'pro' }) {
  const isFree = tier === 'free';
  return (
    <span
      className="inline-flex shrink-0 items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide"
      style={{
        backgroundColor: isFree ? 'rgba(22, 163, 74, 0.12)' : 'rgba(129, 140, 248, 0.15)',
        color: isFree ? 'var(--success)' : 'var(--accent)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {isFree ? 'FREE' : 'PRO'}
    </span>
  );
}

function PrivacyBadge() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-6 text-center"
    >
      <Shield
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--text-muted)' }}
        aria-hidden="true"
      />
      <span
        className="text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        Everything runs on your computer. Your files never leave this app.
      </span>
    </div>
  );
}

function EmptySearch() {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px dashed var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <SearchIcon
        className="h-5 w-5"
        style={{ color: 'var(--text-muted)' }}
        aria-hidden="true"
      />
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        No tools match your search. Try a different term.
      </p>
    </div>
  );
}
