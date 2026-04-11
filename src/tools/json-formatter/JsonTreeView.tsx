/**
 * Hand-rolled JSON tree viewer.
 *
 * Five features, ~300 lines, zero dependencies:
 * 1. Collapsible tree nodes with expand/collapse all
 * 2. Syntax highlighting (keys, strings, numbers, booleans, null)
 * 3. Item count badges on collapsed nodes ({N keys}, [N items])
 * 4. Copy JSON path on click ($.users[0].name → clipboard)
 * 5. Search/filter with match highlighting
 *
 * All colors use CSS variables from themes.css — works in light + dark mode
 * with zero hard-coded colors.
 */

import { useCallback, useMemo, useState } from 'react';
import { ChevronRight, Search, X, Maximize2, Minimize2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JsonTreeViewProps {
  data: unknown;
  className?: string;
  style?: React.CSSProperties;
}

// Path from root, e.g. ['company', 'ceo', 'name']
type JsonPath = (string | number)[];

// ─── Helpers ────────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

const formatPath = (path: JsonPath): string => {
  let result = '$';
  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${segment}]`;
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) {
      result += `.${segment}`;
    } else {
      result += `["${segment.replace(/"/g, '\\"')}"]`;
    }
  }
  return result;
};

const childCount = (value: unknown): number => {
  if (isArray(value)) return value.length;
  if (isObject(value)) return Object.keys(value).length;
  return 0;
};

const matchesSearch = (key: string, value: unknown, query: string): boolean => {
  const q = query.toLowerCase();
  if (key.toLowerCase().includes(q)) return true;
  if (value === null) return 'null'.includes(q);
  if (typeof value === 'boolean') return String(value).includes(q);
  if (typeof value === 'number') return String(value).includes(q);
  if (typeof value === 'string') return value.toLowerCase().includes(q);
  return false;
};

/** Check if any descendant (or self) matches the search query. */
const hasDescendantMatch = (
  key: string,
  value: unknown,
  query: string,
): boolean => {
  if (!query) return true;
  if (matchesSearch(key, value, query)) return true;
  if (isObject(value)) {
    return Object.entries(value).some(([k, v]) => hasDescendantMatch(k, v, query));
  }
  if (isArray(value)) {
    return value.some((v, i) => hasDescendantMatch(String(i), v, query));
  }
  return false;
};

// ─── Value renderer ─────────────────────────────────────────────────────────

function ValueSpan({ value }: { value: unknown }) {
  if (value === null) return <span className="jt-null mono text-xs">null</span>;
  if (typeof value === 'boolean')
    return <span className="jt-boolean mono text-xs">{String(value)}</span>;
  if (typeof value === 'number')
    return <span className="jt-number mono text-xs">{String(value)}</span>;
  if (typeof value === 'string') {
    const display = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    return <span className="jt-string mono text-xs">&quot;{display}&quot;</span>;
  }
  return null;
}

// ─── Tree node ──────────────────────────────────────────────────────────────

interface JsonNodeProps {
  keyName: string | null; // null for root
  value: unknown;
  path: JsonPath;
  depth: number;
  defaultExpanded: boolean;
  searchQuery: string;
  expandAll: number; // increment to expand all, decrement to collapse all
  onCopyPath: (path: string) => void;
}

function JsonNode({
  keyName,
  value,
  path,
  depth,
  defaultExpanded,
  searchQuery,
  expandAll,
  onCopyPath,
}: JsonNodeProps) {
  // Expand/collapse state. `null` means "use the default" (based on depth
  // or search). A boolean means the user (or expand-all) explicitly set it.
  // When a node mounts AFTER an expand-all was triggered (because its parent
  // just expanded), it checks the current expandAll value to decide its
  // initial state — otherwise newly-mounted children would miss the signal.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(() => {
    if (expandAll > 0) return true;
    if (expandAll < 0) return false;
    return null;
  });

  const isExpandable = isObject(value) || isArray(value);
  const expanded = useMemo(() => {
    if (!isExpandable) return false;
    if (manualExpanded !== null) return manualExpanded;
    if (searchQuery && hasDescendantMatch(keyName ?? '', value, searchQuery)) return true;
    return defaultExpanded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpandable, manualExpanded, searchQuery, defaultExpanded, expandAll]);

  // Sync with expand-all / collapse-all changes from the toolbar.
  const [lastExpandAll, setLastExpandAll] = useState(expandAll);
  if (expandAll !== lastExpandAll) {
    setLastExpandAll(expandAll);
    setManualExpanded(expandAll > 0 ? true : expandAll < 0 ? false : null);
  }

  const toggle = useCallback(() => setManualExpanded((prev) => !(prev ?? defaultExpanded)), [defaultExpanded]);

  const handleKeyClick = useCallback(() => {
    onCopyPath(formatPath(path));
  }, [path, onCopyPath]);

  // Filter out children that don't match search
  const filteredEntries = useMemo(() => {
    if (!isExpandable || !expanded) return [];
    const entries: [string, unknown][] = isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>);
    if (!searchQuery) return entries;
    return entries.filter(([k, v]) => hasDescendantMatch(k, v, searchQuery));
  }, [isExpandable, expanded, value, searchQuery]);

  const indent = depth * 16;
  const count = childCount(value);
  const isMatch = searchQuery && matchesSearch(keyName ?? '', value, searchQuery);

  // Don't render if search is active and nothing matches in this subtree
  if (searchQuery && !hasDescendantMatch(keyName ?? '', value, searchQuery)) {
    return null;
  }

  return (
    <div>
      <div className="jt-row" style={{ paddingLeft: indent }}>
        {/* Chevron for expandable nodes */}
        {isExpandable ? (
          <span
            className="jt-chevron"
            data-expanded={expanded}
            onClick={toggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && toggle()}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Key name */}
        {keyName !== null && (
          <>
            <span
              className={`jt-key jt-path-copy mono text-xs ${isMatch ? 'jt-search-match' : ''}`}
              onClick={handleKeyClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleKeyClick()}
              title={`Click to copy: ${formatPath(path)}`}
            >
              &quot;{keyName}&quot;
            </span>
            <span className="jt-colon mono text-xs">:</span>
          </>
        )}

        {/* Value or opening bracket */}
        {isExpandable ? (
          <>
            <span className="jt-bracket mono text-xs">
              {isArray(value) ? '[' : '{'}
            </span>
            {!expanded && (
              <>
                <span className="jt-badge">
                  {count} {isArray(value) ? (count === 1 ? 'item' : 'items') : (count === 1 ? 'key' : 'keys')}
                </span>
                <span className="jt-bracket mono text-xs">
                  {isArray(value) ? ']' : '}'}
                </span>
              </>
            )}
          </>
        ) : (
          <span className={isMatch ? 'jt-search-match' : ''}>
            <ValueSpan value={value} />
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && isExpandable && (
        <>
          {filteredEntries.map(([k, v], i) => (
            <JsonNode
              key={k}
              keyName={isArray(value) ? null : k}
              value={v}
              path={[...path, isArray(value) ? i : k]}
              depth={depth + 1}
              defaultExpanded={depth < 1} // expand 2 levels by default
              searchQuery={searchQuery}
              expandAll={expandAll}
              onCopyPath={onCopyPath}
            />
          ))}
          {/* Closing bracket */}
          <div className="jt-row" style={{ paddingLeft: indent }}>
            <span style={{ width: 16, flexShrink: 0 }} />
            <span className="jt-bracket mono text-xs">
              {isArray(value) ? ']' : '}'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function JsonTreeView({ data, className, style }: JsonTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAll, setExpandAll] = useState(0);
  const showToast = useAppStore((s) => s.showToast);

  const handleCopyPath = useCallback(
    async (pathStr: string) => {
      try {
        await navigator.clipboard.writeText(pathStr);
        showToast(`Copied: ${pathStr}`, 'success');
      } catch {
        showToast('Failed to copy path', 'error');
      }
    },
    [showToast],
  );

  const handleExpandAll = useCallback(() => setExpandAll((n) => Math.abs(n) + 1), []);
  const handleCollapseAll = useCallback(() => setExpandAll((n) => -(Math.abs(n) + 1)), []);

  if (data === undefined) {
    return (
      <div
        className={`flex items-center justify-center p-8 text-sm ${className ?? ''}`}
        style={{ color: 'var(--text-tertiary)', ...style }}
      >
        Paste valid JSON to see the tree view
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className ?? ''}`} style={style}>
      {/* Toolbar: search + expand/collapse */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keys and values…"
            className="mono w-full rounded py-1 pl-7 pr-7 text-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
            }}
            spellCheck={false}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleExpandAll}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
          }}
          title="Expand all"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleCollapseAll}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
          }}
          title="Collapse all"
        >
          <Minimize2 className="h-3 w-3" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <JsonNode
          keyName={null}
          value={data}
          path={[]}
          depth={0}
          defaultExpanded={true}
          searchQuery={searchQuery}
          expandAll={expandAll}
          onCopyPath={handleCopyPath}
        />
      </div>
    </div>
  );
}
