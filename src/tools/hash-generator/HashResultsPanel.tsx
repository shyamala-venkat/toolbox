import { HASH_ALGORITHMS, type HashAlgorithmId } from './meta';
import { HashResultRow, type HashRowState } from './HashResultRow';

export interface HashResultsPanelProps {
  selectedAlgorithms: HashAlgorithmId[];
  results: Record<HashAlgorithmId, HashRowState>;
}

export function HashResultsPanel({ selectedAlgorithms, results }: HashResultsPanelProps) {
  if (selectedAlgorithms.length === 0) {
    return (
      <div
        className="flex min-h-[140px] flex-col items-center justify-center gap-1 px-4 py-8 text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          No algorithms selected
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Choose at least one algorithm above to see hash results.
        </p>
      </div>
    );
  }

  // Preserve the canonical order from HASH_ALGORITHMS so the table never reflows.
  const orderedRows = HASH_ALGORITHMS.filter((a) => selectedAlgorithms.includes(a.id));

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Results
      </div>
      {orderedRows.map((algo) => (
        <HashResultRow
          key={algo.id}
          label={algo.label}
          state={results[algo.id] ?? { kind: 'idle' }}
        />
      ))}
    </div>
  );
}
