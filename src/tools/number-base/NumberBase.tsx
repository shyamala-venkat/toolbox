import { useCallback, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type BaseId = 'bin' | 'oct' | 'dec' | 'hex';

interface BaseConfig {
  id: BaseId;
  label: string;
  radix: 2 | 8 | 10 | 16;
  placeholder: string;
  // Regex that matches valid user input (allows empty; decimal allows sign).
  validate: RegExp;
  hint: string;
}

const BASE_CONFIG: Record<BaseId, BaseConfig> = {
  bin: {
    id: 'bin',
    label: 'Binary',
    radix: 2,
    placeholder: '0 / 1',
    validate: /^[01]*$/,
    hint: 'Digits 0–1',
  },
  oct: {
    id: 'oct',
    label: 'Octal',
    radix: 8,
    placeholder: '0–7',
    validate: /^[0-7]*$/,
    hint: 'Digits 0–7',
  },
  dec: {
    id: 'dec',
    label: 'Decimal',
    radix: 10,
    placeholder: '0–9 (signed)',
    validate: /^-?[0-9]*$/,
    hint: 'Digits 0–9, optional leading -',
  },
  hex: {
    id: 'hex',
    label: 'Hexadecimal',
    radix: 16,
    placeholder: '0–9 A–F',
    validate: /^[0-9a-fA-F]*$/,
    hint: 'Digits 0–9, a–f',
  },
};

const BASE_ORDER: readonly BaseId[] = ['bin', 'oct', 'dec', 'hex'];

type Values = Record<BaseId, string>;

const EMPTY_VALUES: Values = { bin: '', oct: '', dec: '', hex: '' };

// ─── Parsing & formatting ───────────────────────────────────────────────────

/**
 * Parse a raw user-entered digit string in the given base into a BigInt.
 * Returns null for empty or whitespace-only input. Throws on any invalid
 * digit so the caller can surface a field-level error.
 */
const parseValue = (raw: string, base: BaseConfig): bigint | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Reject solitary "-" — the sign needs at least one digit.
  if (base.id === 'dec') {
    if (trimmed === '-' || trimmed === '+') throw new Error('incomplete number');
    return BigInt(trimmed);
  }

  // For non-decimal bases, negative values are unsupported in the input
  // (the UI footer documents the sign behaviour). We treat the input as
  // unsigned magnitude.
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
    throw new Error('signed input only supported in decimal');
  }
  const prefix = base.id === 'bin' ? '0b' : base.id === 'oct' ? '0o' : '0x';
  return BigInt(prefix + trimmed);
};

/**
 * Format a BigInt into a display string in the given radix. For non-decimal
 * bases we show the absolute value and document the magnitude-only
 * behaviour in the footer; a negative sign prefix is added here so users
 * can see the sign was preserved.
 */
const formatValue = (value: bigint, base: BaseConfig): string => {
  if (base.id === 'dec') return value.toString(10);
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const body = abs.toString(base.radix);
  const cased = base.id === 'hex' ? body.toUpperCase() : body;
  return isNegative ? `-${cased}` : cased;
};

// ─── Component ──────────────────────────────────────────────────────────────

function NumberBase() {
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Record<BaseId, string | null>>({
    bin: null,
    oct: null,
    dec: null,
    hex: null,
  });

  const handleChange = useCallback((baseId: BaseId, raw: string) => {
    const base = BASE_CONFIG[baseId];

    // Validate surface syntax against the per-base character class.
    if (!base.validate.test(raw)) {
      // Still update the field's own value so the user sees what they typed,
      // and flag it as invalid. Do NOT update the other fields.
      setValues((prev) => ({ ...prev, [baseId]: raw }));
      setErrors((prev) => ({
        ...prev,
        [baseId]: `Invalid ${base.label.toLowerCase()} digits`,
      }));
      return;
    }

    if (raw.trim().length === 0) {
      setValues(EMPTY_VALUES);
      setErrors({ bin: null, oct: null, dec: null, hex: null });
      return;
    }

    let parsed: bigint | null;
    try {
      parsed = parseValue(raw, base);
    } catch {
      setValues((prev) => ({ ...prev, [baseId]: raw }));
      setErrors((prev) => ({
        ...prev,
        [baseId]: `Invalid ${base.label.toLowerCase()} number`,
      }));
      return;
    }

    if (parsed === null) {
      setValues(EMPTY_VALUES);
      setErrors({ bin: null, oct: null, dec: null, hex: null });
      return;
    }

    // Recompute every field from the parsed BigInt. The field that the user
    // is actively editing keeps its raw text so typing "01" doesn't snap to
    // "1" mid-keystroke.
    const next: Values = {
      bin: formatValue(parsed, BASE_CONFIG.bin),
      oct: formatValue(parsed, BASE_CONFIG.oct),
      dec: formatValue(parsed, BASE_CONFIG.dec),
      hex: formatValue(parsed, BASE_CONFIG.hex),
    };
    next[baseId] = raw;
    setValues(next);
    setErrors({ bin: null, oct: null, dec: null, hex: null });
  }, []);

  const handleClearAll = useCallback(() => {
    setValues(EMPTY_VALUES);
    setErrors({ bin: null, oct: null, dec: null, hex: null });
  }, []);

  const hasAnyValue = useMemo(
    () => BASE_ORDER.some((id) => values[id].length > 0),
    [values],
  );

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  const renderField = (base: BaseConfig) => {
    const value = values[base.id];
    const error = errors[base.id];
    const inputId = `number-base-${base.id}`;
    return (
      <div key={base.id} className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor={inputId}
            className="inline-flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{base.label}</span>
            <span
              className="mono rounded px-1.5 py-0.5 text-[10px] uppercase"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              base {base.radix}
            </span>
          </label>
          <CopyButton value={value} disabled={value.length === 0} />
        </div>
        <div
          className={cn('relative flex items-center')}
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-primary)'}`,
            borderRadius: 'var(--radius-md)',
          }}
        >
          <input
            id={inputId}
            type="text"
            inputMode={base.id === 'dec' ? 'numeric' : 'text'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => handleChange(base.id, e.target.value)}
            placeholder={base.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-err` : `${inputId}-hint`}
            title={error ?? undefined}
            className="mono h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:opacity-50"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        {error ? (
          <p id={`${inputId}-err`} className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : (
          <p
            id={`${inputId}-hint`}
            className="text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {base.hint}
          </p>
        )}
      </div>
    );
  };

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Edit any field — the others update live. Uses BigInt, so arbitrarily
            large values stay exact.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={!hasAnyValue}
          >
            Clear all
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {BASE_ORDER.map((id) => renderField(BASE_CONFIG[id]))}
        </div>

        <div
          className="flex items-start gap-2 p-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Info
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
          <p className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
            Negative numbers can only be entered in the decimal field; the
            binary, octal, and hex views display the absolute value with a
            leading &quot;-&quot; sign for clarity. Two&apos;s-complement
            representation is not shown.
          </p>
        </div>
      </div>
    </ToolPage>
  );
}

export default NumberBase;
