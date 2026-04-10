import { useCallback } from 'react';
import { useToolStore } from '@/stores/toolStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ToolDefinition } from '@/tools/types';
import { toolRegistry } from '@/tools/registry';

/**
 * Convenience hook for tool pages: pushes a tool to the recent list and
 * keeps settingsStore in sync so it survives restarts.
 */
export function useToolHistory(): {
  pushRecent: (id: string) => void;
  clearRecents: () => void;
  recents: ToolDefinition[];
} {
  const pushRecentAction = useToolStore((s) => s.pushRecent);
  const clearRecentsAction = useToolStore((s) => s.clearRecents);
  const recentIds = useToolStore((s) => s.recentToolIds);

  const pushRecent = useCallback(
    (id: string) => {
      pushRecentAction(id);
      const next = useToolStore.getState().recentToolIds;
      useSettingsStore.getState().update({ recentToolIds: next });
    },
    [pushRecentAction],
  );

  const clearRecents = useCallback(() => {
    clearRecentsAction();
    useSettingsStore.getState().update({ recentToolIds: [] });
  }, [clearRecentsAction]);

  const byId = new Map(toolRegistry.map((t) => [t.id, t]));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((t): t is ToolDefinition => Boolean(t));

  return { pushRecent, clearRecents, recents };
}
