import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toolRegistry } from '@/tools/registry';
import { TOOL_CATEGORIES } from '@/tools/categories';
import type { ToolCategory, ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { KeyboardShortcut } from '@/components/ui/KeyboardShortcut';
import { useAppStore } from '@/stores/appStore';
import { useRecentTools } from '@/stores/toolStore';

export function Home() {
  const navigate = useNavigate();
  const openPalette = useAppStore((s) => s.openCommandPalette);
  const recents = useRecentTools(6);

  const byCategory = useMemo(() => {
    const map = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of toolRegistry) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return map;
  }, []);

  const isEmpty = toolRegistry.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-10">
      <header className="mb-10">
        <h1
          className="mb-2 text-2xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Welcome to ToolBox
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          A curated set of local-first utilities. Every tool runs on your machine — nothing leaves
          the device unless you explicitly opt in.
        </p>
        <button
          type="button"
          onClick={openPalette}
          className="mt-5 flex w-full max-w-lg items-center gap-3 px-4 py-3 text-left"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-tertiary)',
          }}
        >
          <Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <span className="flex-1 text-sm">Search tools, jump to any utility…</span>
          <KeyboardShortcut combo="mod+k" />
        </button>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {recents.length > 0 && (
            <section className="mb-10">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Recent
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recents.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} onOpen={(id) => navigate(`/tools/${id}`)} />
                ))}
              </div>
            </section>
          )}

          {TOOL_CATEGORIES.map((cat) => {
            const tools = byCategory.get(cat.id) ?? [];
            if (tools.length === 0) return null;
            return (
              <section key={cat.id} className="mb-10">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {cat.label}
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {cat.description}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onOpen={(id) => navigate(`/tools/${id}`)} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

interface ToolCardProps {
  tool: ToolDefinition;
  onOpen: (id: string) => void;
}

function ToolCard({ tool, onOpen }: ToolCardProps) {
  const Icon = getToolIcon(tool.icon);
  return (
    <button
      type="button"
      onClick={() => onOpen(tool.id)}
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
        <ArrowRight
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-hidden="true"
        />
      </div>
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {tool.name}
      </div>
      <div className="line-clamp-2 text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
        {tool.description}
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px dashed var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <Sparkles className="h-6 w-6" style={{ color: 'var(--accent)' }} aria-hidden="true" />
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        No tools yet
      </h2>
      <p className="max-w-md text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Tools will appear here as they're added to the registry. Check back soon.
      </p>
    </div>
  );
}
