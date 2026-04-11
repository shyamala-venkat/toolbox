import { useCallback, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { CopyButton } from '@/components/ui/CopyButton';
import { meta } from './meta';

// ─── Helpers ──────────────────────────────────────────────────────────────

const GROUPS = ['Owner', 'Group', 'Others'] as const;
const PERMS = ['Read', 'Write', 'Execute'] as const;
const PERM_BITS = [4, 2, 1] as const; // r=4, w=2, x=1

function octalToPermissions(octal: string): boolean[][] {
  const grid: boolean[][] = [[], [], []];
  for (let g = 0; g < 3; g++) {
    const digit = parseInt(octal[g] ?? '0', 10);
    for (let p = 0; p < 3; p++) {
      grid[g]![p] = Boolean(digit & PERM_BITS[p]!);
    }
  }
  return grid;
}

function permissionsToOctal(grid: boolean[][]): string {
  let result = '';
  for (let g = 0; g < 3; g++) {
    let digit = 0;
    for (let p = 0; p < 3; p++) {
      if (grid[g]?.[p]) digit += PERM_BITS[p]!;
    }
    result += digit.toString();
  }
  return result;
}

function permissionsToSymbolic(grid: boolean[][]): string {
  const chars = ['r', 'w', 'x'] as const;
  let result = '';
  for (let g = 0; g < 3; g++) {
    for (let p = 0; p < 3; p++) {
      result += grid[g]?.[p] ? chars[p] : '-';
    }
  }
  return result;
}

function isValidOctal(value: string): boolean {
  return /^[0-7]{3}$/.test(value);
}

// ─── Checkbox cell ────────────────────────────────────────────────────────

function PermCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center p-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="sr-only"
      />
      <span
        className="flex h-5 w-5 items-center justify-center rounded-[3px] transition-colors duration-150"
        style={{
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-primary)',
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-primary)'}`,
        }}
        aria-hidden="true"
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--accent-contrast)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 6l2.5 2.5 4.5-5" />
          </svg>
        )}
      </span>
    </label>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

function UnixPermissions() {
  const [octal, setOctal] = useState('755');

  const grid = useMemo(() => octalToPermissions(octal), [octal]);
  const symbolic = useMemo(() => permissionsToSymbolic(grid), [grid]);
  const chmodCommand = `chmod ${octal} filename`;
  const isValid = isValidOctal(octal);

  const handleOctalChange = useCallback((value: string) => {
    // Allow partial typing: only digits 0-7, max 3 chars
    const filtered = value.replace(/[^0-7]/g, '').slice(0, 3);
    setOctal(filtered);
  }, []);

  const handleCheckboxToggle = useCallback(
    (group: number, perm: number, checked: boolean) => {
      const newGrid = grid.map((row) => [...row]);
      newGrid[group]![perm] = checked;
      setOctal(permissionsToOctal(newGrid));
    },
    [grid],
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Octal input + Symbolic display */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <Input
              label="Octal"
              value={octal}
              onChange={(e) => handleOctalChange(e.target.value)}
              placeholder="755"
              aria-label="Octal permissions"
              className="mono text-center text-lg"
              maxLength={3}
              error={octal.length === 3 && !isValid ? 'Digits must be 0-7' : undefined}
            />
          </div>
          <div
            className="flex flex-col gap-1.5"
          >
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Symbolic
            </span>
            <div
              className="mono flex h-9 items-center px-3 text-lg tracking-wider"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
              }}
            >
              {isValid ? symbolic : '---'}
            </div>
          </div>
        </div>

        {/* Checkbox grid */}
        <div
          className="overflow-hidden"
          style={{
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <th
                  className="px-4 py-2 text-left text-xs font-medium"
                  style={{
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-primary)',
                    width: '35%',
                  }}
                >
                  Group
                </th>
                {PERMS.map((perm) => (
                  <th
                    key={perm}
                    className="px-4 py-2 text-center text-xs font-medium"
                    style={{
                      color: 'var(--text-tertiary)',
                      borderBottom: '1px solid var(--border-primary)',
                    }}
                  >
                    {perm}
                  </th>
                ))}
                <th
                  className="px-4 py-2 text-center text-xs font-medium"
                  style={{
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-primary)',
                  }}
                >
                  Octal
                </th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group, g) => (
                <tr
                  key={group}
                  style={{
                    borderBottom:
                      g < GROUPS.length - 1
                        ? '1px solid var(--border-secondary)'
                        : undefined,
                  }}
                >
                  <td
                    className="px-4 py-2 text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {group}
                  </td>
                  {PERMS.map((perm, p) => (
                    <td key={perm} className="text-center">
                      <PermCheckbox
                        checked={isValid ? (grid[g]?.[p] ?? false) : false}
                        onChange={(checked) => handleCheckboxToggle(g, p, checked)}
                        label={`${group} ${perm}`}
                      />
                    </td>
                  ))}
                  <td
                    className="mono px-4 py-2 text-center text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {isValid ? octal[g] : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* chmod command */}
        {isValid && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Command
              </span>
              <code
                className="mono text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                {chmodCommand}
              </code>
            </div>
            <CopyButton value={chmodCommand} size="sm" />
          </div>
        )}

        {/* Description */}
        {isValid && (
          <div
            className="px-3 py-2 text-center text-xs"
            style={{
              color: 'var(--text-tertiary)',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Owner: {symbolic.slice(0, 3)} &middot; Group: {symbolic.slice(3, 6)} &middot; Others: {symbolic.slice(6, 9)}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default UnixPermissions;
