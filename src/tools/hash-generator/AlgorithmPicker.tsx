import { HASH_ALGORITHMS, type HashAlgorithmId } from './meta';

export interface AlgorithmPickerProps {
  selected: HashAlgorithmId[];
  onChange: (next: HashAlgorithmId[]) => void;
}

export function AlgorithmPicker({ selected, onChange }: AlgorithmPickerProps) {
  const toggle = (id: HashAlgorithmId): void => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      // Re-derive the order from HASH_ALGORITHMS so the canonical sequence is
      // always preserved regardless of click order.
      const next = HASH_ALGORITHMS.map((a) => a.id).filter(
        (id2) => id2 === id || selected.includes(id2),
      );
      onChange(next);
    }
  };

  return (
    <fieldset
      className="flex flex-wrap items-center gap-2"
      aria-label="Hash algorithms"
    >
      <legend className="sr-only">Hash algorithms</legend>
      {HASH_ALGORITHMS.map((algo) => {
        const isSelected = selected.includes(algo.id);
        return (
          <label
            key={algo.id}
            className="inline-flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors duration-150"
            style={{
              backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
              color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-primary)'}`,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggle(algo.id)}
              className="sr-only"
              aria-label={algo.label}
            />
            {algo.label}
          </label>
        );
      })}
    </fieldset>
  );
}
