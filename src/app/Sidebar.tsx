import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Star,
  Wrench,
} from 'lucide-react';
import { toolRegistry, searchTools } from '@/tools/registry';
import { TOOL_CATEGORIES } from '@/tools/categories';
import type { ToolCategory, ToolDefinition } from '@/tools/types';
import { getToolIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useFavoriteTools, useRecentTools } from '@/stores/toolStore';

// Layout bounds for the user-configurable expanded width. Anything outside
// this range comes from a corrupted preferences file or a malicious renderer
// — we clamp defensively so the layout cannot be broken at runtime.
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 320;
const SIDEBAR_COLLAPSED_WIDTH = 48;

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const openPalette = useAppStore((s) => s.openCommandPalette);
  const sidebarWidthPref = useSettingsStore((s) => s.preferences.sidebarWidth);
  const expandedWidth = Math.max(
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, sidebarWidthPref),
  );

  const favorites = useFavoriteTools();
  const recents = useRecentTools(5);

  const [localQuery, setLocalQuery] = useState('');

  const filteredRegistry = useMemo(() => searchTools(localQuery.trim()), [localQuery]);

  const byCategory = useMemo(() => {
    const map = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of filteredRegistry) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return map;
  }, [filteredRegistry]);

  return (
    <aside
      className="flex h-full shrink-0 flex-col"
      style={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : expandedWidth,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
        transition: 'width 180ms ease-out',
      }}
    >
      {/* Brand */}
      <div
        className="flex h-12 items-center gap-2 px-3"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            ToolBox
          </span>
        )}
      </div>

      {/* Search — collapsed mode shows a button that opens the command palette */}
      <div className="px-2 pt-3 pb-2">
        {collapsed ? (
          <button
            type="button"
            onClick={openPalette}
            aria-label="Open command palette"
            className="flex h-8 w-8 items-center justify-center"
            style={{
              color: 'var(--sidebar-text)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <SearchIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <div
            className="relative flex h-8 items-center"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <SearchIcon
              className="pointer-events-none absolute left-2 h-3.5 w-3.5"
              style={{ color: 'var(--text-tertiary)' }}
              aria-hidden="true"
            />
            <input
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search tools"
              aria-label="Search tools"
              className="h-full w-full bg-transparent pr-2 pl-7 text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <nav className="flex-1 overflow-y-auto px-1 pb-2">
        {toolRegistry.length === 0 ? (
          <EmptyRegistryPlaceholder collapsed={collapsed} />
        ) : (
          <>
            {/* Favorites */}
            {favorites.length > 0 ? (
              <Section title="Favorites" icon={<Star className="h-3.5 w-3.5" />} collapsed={collapsed}>
                {favorites.map((tool) => (
                  <ToolRow key={tool.id} tool={tool} collapsed={collapsed} />
                ))}
              </Section>
            ) : (
              !collapsed && (
                <div className="px-3 pt-2 pb-3">
                  <div
                    className="rounded px-2 py-2 text-[11px] leading-snug"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-tertiary)',
                      border: '1px dashed var(--border-primary)',
                    }}
                  >
                    Pin your favorite tools — they'll live here.
                  </div>
                </div>
              )
            )}

            {/* Recent */}
            {recents.length > 0 && (
              <Section title="Recent" icon={<Clock className="h-3.5 w-3.5" />} collapsed={collapsed}>
                {recents.map((tool) => (
                  <ToolRow key={tool.id} tool={tool} collapsed={collapsed} />
                ))}
              </Section>
            )}

            {/* Categories */}
            {TOOL_CATEGORIES.map((cat) => {
              const tools = byCategory.get(cat.id) ?? [];
              if (tools.length === 0) return null;
              return (
                <CategorySection
                  key={cat.id}
                  label={cat.label}
                  iconName={cat.icon}
                  tools={tools}
                  collapsed={collapsed}
                />
              );
            })}

            {/* TODO(phase-2): drag-to-reorder favorites. */}
          </>
        )}
      </nav>

      {/* Footer — collapse + settings */}
      <div
        className="flex h-11 items-center gap-1 px-2"
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
      >
        <NavLink
          to="/settings"
          aria-label="Settings"
          className={cn(
            'tb-nav-item relative flex h-8 items-center gap-2 rounded px-2 text-xs',
            collapsed ? 'w-8 justify-center' : 'flex-1',
          )}
          style={({ isActive }) => ({
            color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
          })}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">Settings</span>}
        </NavLink>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-8 w-8 items-center justify-center rounded"
          style={{ color: 'var(--sidebar-text)' }}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}

// ─── Section primitives ─────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon?: ReactNode;
  collapsed: boolean;
  children: ReactNode;
  count?: number;
}

function Section({ title, icon, collapsed, children, count }: SectionProps) {
  return (
    <div className="pt-3">
      {!collapsed && (
        <div
          className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {icon}
          <span>{title}</span>
          {typeof count === 'number' && (
            <span
              className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
            >
              {count}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-0.5 px-1">{children}</div>
    </div>
  );
}

interface CategorySectionProps {
  label: string;
  iconName: string;
  tools: ToolDefinition[];
  collapsed: boolean;
}

function CategorySection({ label, iconName, tools, collapsed }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const Icon = getToolIcon(iconName);

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5 px-1 pt-3">
        {tools.map((tool) => (
          <ToolRow key={tool.id} tool={tool} collapsed />
        ))}
      </div>
    );
  }

  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="flex-1 text-left">{label}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
        >
          {tools.length}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-0.5 px-1">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolRowProps {
  tool: ToolDefinition;
  collapsed: boolean;
}

function ToolRow({ tool, collapsed }: ToolRowProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const Icon = getToolIcon(tool.icon);
  const isActive = location.pathname === `/tools/${tool.id}`;

  return (
    <button
      type="button"
      onClick={() => navigate(`/tools/${tool.id}`)}
      title={collapsed ? tool.name : undefined}
      data-active={isActive || undefined}
      className={cn(
        'tb-nav-item relative flex h-8 items-center gap-2 px-2 text-left text-xs',
        collapsed ? 'w-8 justify-center' : 'w-full',
      )}
      style={{
        color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{tool.name}</span>}
    </button>
  );
}

function EmptyRegistryPlaceholder({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-3 pt-6 text-center">
      <div
        className="rounded px-3 py-4 text-[11px] leading-snug"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-tertiary)',
          border: '1px dashed var(--border-primary)',
        }}
      >
        No tools registered yet.
      </div>
    </div>
  );
}
