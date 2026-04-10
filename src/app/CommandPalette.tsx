import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToolStore } from '@/stores/toolStore';
import { toolRegistry, searchTools } from '@/tools/registry';
import type { ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { getCategoryMeta } from '@/tools/categories';
import { KeyboardShortcut } from '@/components/ui/KeyboardShortcut';

/**
 * ⌘K quick switcher.
 *
 * Render order:
 *   - With no query: recents first (most recent at top), then favorites,
 *     then the rest of the registry in declaration order. Duplicates removed.
 *   - With a query: `searchTools(query)` results in declaration order.
 *
 * Keyboard:
 *   ↑ / ↓ — move selection (wraps)
 *   Enter — open highlighted tool
 *   Esc   — close palette
 *   Tab   — trapped within the palette (input → list item → close)
 */
export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const close = useAppStore((s) => s.closeCommandPalette);

  const favoriteIds = useToolStore((s) => s.favoriteToolIds);
  const recentIds = useToolStore((s) => s.recentToolIds);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();

  // Reset query & selection every time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Focus after paint so the ref is attached.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<ToolDefinition[]>(() => {
    if (!open) return [];
    const trimmed = query.trim();
    if (trimmed) return searchTools(trimmed);

    const seen = new Set<string>();
    const out: ToolDefinition[] = [];
    const byId = new Map(toolRegistry.map((t) => [t.id, t]));

    const pushMany = (ids: string[]): void => {
      for (const id of ids) {
        if (seen.has(id)) continue;
        const tool = byId.get(id);
        if (!tool) continue;
        seen.add(id);
        out.push(tool);
      }
    };

    pushMany(recentIds);
    pushMany(favoriteIds);
    for (const tool of toolRegistry) {
      if (seen.has(tool.id)) continue;
      seen.add(tool.id);
      out.push(tool);
    }
    return out;
  }, [open, query, favoriteIds, recentIds]);

  // Clamp the active index whenever the result set changes.
  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [results.length, activeIndex]);

  // Scroll the active row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runTool = (tool: ToolDefinition): void => {
    close();
    navigate(`/tools/${tool.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // Trap Tab inside the palette. The only focusable element is the
      // input — results are navigated with arrow keys — so Tab becomes a
      // no-op and focus stays where it is. Prevents focus from escaping
      // into Layout underneath.
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const tool = results[activeIndex];
      if (tool) runTool(tool);
      return;
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      style={{ backgroundColor: 'var(--bg-overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="tb-anim-scale-in mt-[12vh] flex w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onKeyDown={onKeyDown}
      >
        <div
          className="flex h-12 items-center gap-3 px-4"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <SearchIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Type a tool name…"
            aria-label="Search tools"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--text-primary)' }}
          />
          <KeyboardShortcut combo="esc" />
        </div>

        <ul
          ref={listRef}
          role="listbox"
          aria-label="Tools"
          className="max-h-[400px] overflow-y-auto py-1"
        >
          {results.length === 0 ? (
            <li
              className="px-4 py-6 text-center text-sm"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {toolRegistry.length === 0
                ? 'No tools registered yet.'
                : 'No tools match your search.'}
            </li>
          ) : (
            results.map((tool, idx) => {
              const Icon = getToolIcon(tool.icon);
              const category = getCategoryMeta(tool.category);
              const isActive = idx === activeIndex;
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-index={idx}
                    data-active={isActive || undefined}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runTool(tool)}
                    className="tb-cp-row flex w-full items-center gap-3 px-4 py-2.5 text-left"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'var(--text-tertiary)' }}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{tool.name}</span>
                      <span
                        className="truncate text-[11px]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {tool.description}
                      </span>
                    </div>
                    {category && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {category.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div
          className="flex items-center justify-between gap-4 px-4 py-2 text-[11px]"
          style={{
            borderTop: '1px solid var(--border-secondary)',
            color: 'var(--text-tertiary)',
          }}
        >
          <span className="flex items-center gap-2">
            <KeyboardShortcut combo="arrowup" />
            <KeyboardShortcut combo="arrowdown" />
            <span>navigate</span>
          </span>
          <span className="flex items-center gap-2">
            <KeyboardShortcut combo="enter" />
            <span>open</span>
          </span>
        </div>
      </div>
    </div>
  );
}
