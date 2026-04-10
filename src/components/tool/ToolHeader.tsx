import { Star } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { useToolStore } from '@/stores/toolStore';
import { useSettingsStore } from '@/stores/settingsStore';

export interface ToolHeaderProps {
  tool: ToolMeta;
}

export function ToolHeader({ tool }: ToolHeaderProps) {
  const isFavorite = useToolStore((s) => s.favoriteToolIds.includes(tool.id));
  const toggleFavorite = useToolStore((s) => s.toggleFavorite);
  const Icon = getToolIcon(tool.icon);

  const handleToggleFavorite = (): void => {
    toggleFavorite(tool.id);
    const next = useToolStore.getState().favoriteToolIds;
    useSettingsStore.getState().update({ favoriteToolIds: next });
  };

  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {tool.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {tool.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
          className="inline-flex h-9 w-9 items-center justify-center transition-colors"
          style={{
            color: isFavorite ? 'var(--warning)' : 'var(--text-tertiary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Star
            className="h-5 w-5"
            fill={isFavorite ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
      </div>
    </header>
  );
}
