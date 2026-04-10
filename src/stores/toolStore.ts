/**
 * Tool-centric state: favorites and recents.
 *
 * Favorites and recents are mirrored to `settingsStore` for persistence.
 * This store owns the live, in-memory representation and the selectors used
 * by the sidebar, command palette, and home page.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { toolRegistry } from '@/tools/registry';
import type { ToolDefinition } from '@/tools/types';

const MAX_RECENT = 20;

interface ToolStoreState {
  favoriteToolIds: string[];
  recentToolIds: string[];

  setFavoriteToolIds: (ids: string[]) => void;
  setRecentToolIds: (ids: string[]) => void;

  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  pushRecent: (id: string) => void;
  clearRecents: () => void;
}

export const useToolStore = create<ToolStoreState>((set, get) => ({
  favoriteToolIds: [],
  recentToolIds: [],

  setFavoriteToolIds: (favoriteToolIds) => set({ favoriteToolIds }),
  setRecentToolIds: (recentToolIds) => set({ recentToolIds }),

  toggleFavorite: (id) => {
    const current = get().favoriteToolIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    set({ favoriteToolIds: next });
  },
  isFavorite: (id) => get().favoriteToolIds.includes(id),

  pushRecent: (id) => {
    const current = get().recentToolIds;
    const deduped = [id, ...current.filter((x) => x !== id)].slice(0, MAX_RECENT);
    set({ recentToolIds: deduped });
  },
  clearRecents: () => set({ recentToolIds: [] }),
}));

// ─── Selector hooks ─────────────────────────────────────────────────────────
//
// These read from the registry directly and memoize per-render so components
// don't have to worry about stale filter results or needless recomputation.

/**
 * Returns the subset of `toolRegistry` that is pinned, preserving the order
 * the user added them in (first pinned first). Unknown ids are silently
 * dropped — can happen if a tool is removed between sessions.
 */
export const useFavoriteTools = (): ToolDefinition[] => {
  const ids = useToolStore((s) => s.favoriteToolIds);
  return useMemo(() => {
    const byId = new Map(toolRegistry.map((t) => [t.id, t]));
    const out: ToolDefinition[] = [];
    for (const id of ids) {
      const tool = byId.get(id);
      if (tool) out.push(tool);
    }
    return out;
  }, [ids]);
};

/**
 * Returns recent tools in most-recent-first order, capped at `limit`.
 */
export const useRecentTools = (limit = MAX_RECENT): ToolDefinition[] => {
  const ids = useToolStore((s) => s.recentToolIds);
  return useMemo(() => {
    const byId = new Map(toolRegistry.map((t) => [t.id, t]));
    const out: ToolDefinition[] = [];
    for (const id of ids) {
      const tool = byId.get(id);
      if (tool) out.push(tool);
      if (out.length >= limit) break;
    }
    return out;
  }, [ids, limit]);
};
