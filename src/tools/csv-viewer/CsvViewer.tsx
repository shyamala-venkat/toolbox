import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { meta } from './meta';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RENDER_ROWS = 1000;

// ─── Persistence ───────────────────────────────────────────────────────────

interface CsvViewerDefaults {
  firstRowIsHeader: boolean;
}

const sanitizeDefaults = (raw: unknown): CsvViewerDefaults => {
  if (raw === null || typeof raw !== 'object') return { firstRowIsHeader: true };
  const obj = raw as Record<string, unknown>;
  return {
    firstRowIsHeader:
      typeof obj.firstRowIsHeader === 'boolean' ? obj.firstRowIsHeader : true,
  };
};

// ─── Types ──────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;

interface SortState {
  column: string;
  direction: SortDir;
}

// ─── Component ──────────────────────────────────────────────────────────────

function CsvViewer() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rawText, setRawText] = useState('');
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(initial.firstRowIsHeader);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ column: '', direction: null });
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Persist header toggle
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({
      toolDefaults: { ...allDefaults, [meta.id]: { firstRowIsHeader } satisfies CsvViewerDefaults },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstRowIsHeader]);

  // ─── Parse ─────────────────────────────────────────────────────────────

  const parseCsv = useCallback(
    (text: string) => {
      if (!text.trim()) {
        setData([]);
        setColumns([]);
        setTotalRows(0);
        return;
      }
      try {
        const result = Papa.parse<Record<string, string>>(text, {
          header: firstRowIsHeader,
          skipEmptyLines: true,
        });

        let parsedData: Record<string, string>[];
        let parsedColumns: string[];

        if (firstRowIsHeader && result.meta.fields) {
          parsedColumns = result.meta.fields;
          parsedData = result.data;
        } else {
          // When no header, Papa returns arrays; convert to records
          const rows = result.data as unknown as string[][];
          const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
          parsedColumns = Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
          parsedData = rows.map((row) => {
            const record: Record<string, string> = {};
            parsedColumns.forEach((col, i) => {
              record[col] = row[i] ?? '';
            });
            return record;
          });
        }

        setTotalRows(parsedData.length);
        setData(parsedData.slice(0, MAX_RENDER_ROWS));
        setColumns(parsedColumns);
        setSort({ column: '', direction: null });
        setSearch('');
      } catch {
        showToast('Failed to parse CSV', 'error');
      }
    },
    [firstRowIsHeader, showToast],
  );

  // Re-parse when text or header setting changes
  useEffect(() => {
    parseCsv(rawText);
  }, [rawText, parseCsv]);

  // ─── File drop ─────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setRawText(text);
      }
    };
    reader.readAsText(file);
  }, []);

  // ─── Sort ──────────────────────────────────────────────────────────────

  const handleSort = useCallback(
    (column: string) => {
      setSort((prev) => {
        if (prev.column !== column) return { column, direction: 'asc' };
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        return { column: '', direction: null };
      });
    },
    [],
  );

  // ─── Filter + sort data ────────────────────────────────────────────────

  const processedData = useMemo(() => {
    let rows = [...data];

    // Filter
    if (search.trim()) {
      const term = search.toLowerCase();
      rows = rows.filter((row) =>
        columns.some((col) => (row[col] ?? '').toLowerCase().includes(term)),
      );
    }

    // Sort
    if (sort.column && sort.direction) {
      const col = sort.column;
      const dir = sort.direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const aVal = a[col] ?? '';
        const bVal = b[col] ?? '';
        // Try numeric comparison
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
          return (aNum - bNum) * dir;
        }
        return aVal.localeCompare(bVal) * dir;
      });
    }

    return rows;
  }, [data, search, sort, columns]);

  // ─── Cell editing ──────────────────────────────────────────────────────

  const handleCellClick = useCallback((rowIndex: number, col: string) => {
    setEditingCell({ row: rowIndex, col });
  }, []);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const handleCellChange = useCallback(
    (rowIndex: number, col: string, value: string) => {
      setData((prev) => {
        const updated = [...prev];
        const target = processedData[rowIndex];
        if (!target) return prev;
        const originalIndex = prev.indexOf(target);
        if (originalIndex >= 0 && updated[originalIndex]) {
          updated[originalIndex] = { ...updated[originalIndex], [col]: value };
        }
        return updated;
      });
    },
    [processedData],
  );

  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        setEditingCell(null);
      }
      if (e.key === 'Tab' && editingCell) {
        e.preventDefault();
        const colIdx = columns.indexOf(editingCell.col);
        const nextCol = columns[colIdx + 1];
        if (nextCol) {
          setEditingCell({ row: editingCell.row, col: nextCol });
        } else {
          setEditingCell(null);
        }
      }
    },
    [editingCell, columns],
  );

  // ─── Export ────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (data.length === 0) return;
    const csv = Papa.unparse(data, { columns });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded', 'success');
  }, [data, columns, showToast]);

  // ─── Render ────────────────────────────────────────────────────────────

  const hasData = columns.length > 0 && data.length > 0;

  return (
    <ToolPage tool={meta} fullWidth>
      <div className="flex flex-col gap-5">
        {/* Input area: drop zone + paste */}
        {!hasData && (
          <div className="flex flex-col gap-4">
            <FileDropZone
              onDrop={handleFileDrop}
              accept={['.csv', '.tsv', '.txt']}
              multiple={false}
              label="Drop a CSV file here"
              description="Or click to browse. Supports CSV, TSV, and plain text."
            />
            <div
              className="text-center text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              or paste CSV text below
            </div>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'Name,Email,Role\nJane Doe,jane@example.com,Engineer\nJohn Smith,john@example.com,Designer'}
              monospace
              rows={8}
              spellCheck={false}
              aria-label="Paste CSV text"
            />
          </div>
        )}

        {/* Toolbar */}
        {hasData && (
          <div
            className="flex flex-wrap items-center gap-4 px-3 py-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="w-64">
              <Input
                placeholder="Search rows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filter rows"
              />
            </div>
            <Toggle
              checked={firstRowIsHeader}
              onChange={setFirstRowIsHeader}
              label="First row is header"
            />
            <div className="ml-auto flex items-center gap-3">
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {processedData.length} row{processedData.length === 1 ? '' : 's'} \u00b7{' '}
                {columns.length} column{columns.length === 1 ? '' : 's'}
                {totalRows > MAX_RENDER_ROWS && (
                  <span> (showing {MAX_RENDER_ROWS.toLocaleString()} of {totalRows.toLocaleString()})</span>
                )}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleExport}
                leadingIcon={<Download className="h-4 w-4" />}
              >
                Export CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRawText('');
                  setData([]);
                  setColumns([]);
                  setSearch('');
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {hasData && (
          <div
            className="overflow-auto"
            style={{
              maxHeight: '70vh',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <table className="w-full border-collapse text-sm" style={{ minWidth: '100%' }}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="sticky top-0 cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderBottom: '1px solid var(--border-primary)',
                        color: 'var(--text-secondary)',
                      }}
                      onClick={() => handleSort(col)}
                      role="columnheader"
                      aria-sort={
                        sort.column === col
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {col}
                        {sort.column === col && sort.direction === 'asc' && (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        )}
                        {sort.column === col && sort.direction === 'desc' && (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processedData.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-8 text-center text-sm"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      No rows match the search filter.
                    </td>
                  </tr>
                )}
                {processedData.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={cn('transition-colors duration-75')}
                    style={{
                      backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                    }}
                  >
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.row === rowIdx && editingCell?.col === col;
                      return (
                        <td
                          key={col}
                          className="whitespace-nowrap px-3 py-1.5"
                          style={{
                            borderBottom: '1px solid var(--border-secondary)',
                            color: 'var(--text-primary)',
                            cursor: 'text',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          onClick={() => handleCellClick(rowIdx, col)}
                          title={row[col] ?? ''}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={row[col] ?? ''}
                              onChange={(e) =>
                                handleCellChange(rowIdx, col, e.target.value)
                              }
                              onBlur={handleCellBlur}
                              onKeyDown={handleCellKeyDown}
                              className="w-full bg-transparent text-sm outline-none"
                              style={{
                                color: 'var(--text-primary)',
                                borderBottom: '1px solid var(--accent)',
                              }}
                            />
                          ) : (
                            <span className="text-sm">{row[col] ?? ''}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default CsvViewer;
