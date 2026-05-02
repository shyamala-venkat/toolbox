/**
 * EditorHistoryTabs — replaces the right-side drawer with an inline tab
 * pattern. Two tabs at the top of the tool's content area:
 *
 *   ┌─────────┐┌────────────┐
 *   │ Editor  ││ Recent (N) │
 *   └─────────┴────────────┴────────────────────
 *
 * Click "Editor" → tool's input/output renders.
 * Click "Recent (N)" → list of past runs renders. Click a row to expand
 * inline; click [Restore to editor] to load it back AND switch to Editor
 * tab automatically.
 *
 * Both tabs stay mounted (the inactive one is `display:none`) so the
 * tool's local state (input, scroll position, etc.) is preserved across
 * tab switches.
 *
 * This component is mounted by ToolPage when the tool is eligible for
 * history (`!sensitiveContent && historyEligible !== false`). Ineligible
 * tools render their content directly without the tab chrome.
 */

import { useState } from 'react';
import { Pencil, Clock } from 'lucide-react';
import type { ToolMeta } from '@/tools/types';
import { useHistoryStore } from '@/stores/historyStore';
import { useHistoryRestore } from '@/contexts/HistoryRestoreContext';
import { RecentList } from './RecentList';

interface EditorHistoryTabsProps {
  tool: ToolMeta;
  /** The tool's current input. Forwarded to RecentList so the Restore
   *  action can confirm before overwriting non-empty input. Optional. */
  currentInput?: string;
  children: React.ReactNode;
}

export function EditorHistoryTabs({ tool, currentInput, children }: EditorHistoryTabsProps) {
  const [active, setActive] = useState<'editor' | 'recent'>('editor');

  const count = useHistoryStore(
    (s) => s.entriesByTool[tool.id]?.length ?? 0,
  );
  const { requestRestore } = useHistoryRestore();

  const handleRestore = (input: string, params: unknown): void => {
    requestRestore({ input, params });
    setActive('editor');
  };

  return (
    <div className="flex w-full flex-col">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Editor or recent runs"
        className="mb-4 flex shrink-0 items-center gap-1"
        style={{
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <TabButton
          active={active === 'editor'}
          onClick={() => setActive('editor')}
          icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Editor"
          ariaControls={`${tool.id}-editor-panel`}
        />
        <TabButton
          active={active === 'recent'}
          onClick={() => setActive('recent')}
          icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Recent"
          badge={count > 0 ? count : null}
          ariaControls={`${tool.id}-recent-panel`}
        />
      </div>

      {/* Editor tab — kept mounted via display:none so the tool's local
          state survives tab switches. */}
      <div
        id={`${tool.id}-editor-panel`}
        role="tabpanel"
        aria-labelledby={`${tool.id}-editor-tab`}
        hidden={active !== 'editor'}
        // Use `display: none` (via `hidden`) rather than unmounting so
        // tools don't lose their input/output state on tab switch.
      >
        {children}
      </div>

      {/* Recent tab — only mount when active to avoid running list-fetch
          IPC for tools the user never visits the Recent tab on. */}
      {active === 'recent' ? (
        <div
          id={`${tool.id}-recent-panel`}
          role="tabpanel"
          aria-labelledby={`${tool.id}-recent-tab`}
        >
          <RecentList
            tool={tool}
            currentInput={currentInput}
            onRestore={handleRestore}
          />
        </div>
      ) : null}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | null;
  ariaControls: string;
}

function TabButton({ active, onClick, icon, label, badge, ariaControls }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={ariaControls}
      onClick={onClick}
      // The active tab gets the accent underline. Inactive uses tertiary
      // text + transparent border so the bar's height is stable across
      // active/inactive states.
      className="relative -mb-px inline-flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}>
        {icon}
      </span>
      <span>{label}</span>
      {badge != null ? (
        <span
          className="ml-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            backgroundColor: active ? 'var(--accent-subtle, var(--surface-2))' : 'var(--surface-2)',
            color: active ? 'var(--accent)' : 'var(--text-tertiary)',
          }}
          aria-label={`${badge} ${badge === 1 ? 'entry' : 'entries'}`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
