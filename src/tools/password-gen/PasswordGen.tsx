import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, RefreshCw, Sparkles } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { useClipboard } from '@/hooks/useClipboard';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

interface PasswordGenDefaults {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  bulkCount: number;
}

const DEFAULTS: PasswordGenDefaults = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
  bulkCount: 1,
};

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const MIN_BULK = 1;
const MAX_BULK = 50;

// Character sets. Ambiguous characters (I l 1 O 0) are filtered out when the
// `excludeAmbiguous` toggle is on.
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~`';
const AMBIGUOUS = new Set(['I', 'l', '1', 'O', '0']);

const filterAmbiguous = (chars: string): string => {
  let out = '';
  for (const ch of chars) {
    if (!AMBIGUOUS.has(ch)) out += ch;
  }
  return out;
};

// Pick a random index in [0, max) using a CSPRNG and rejection sampling
// to avoid modulo bias. This is the single source of randomness in this
// file — NEVER Math.random.
const randomIndex = (max: number): number => {
  if (max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    const n = buf[0]!;
    if (n < limit) return n % max;
  }
};

interface CharsetConfig {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

interface BuiltCharset {
  pool: string;
  requiredPools: string[];
}

const buildCharset = (cfg: CharsetConfig): BuiltCharset => {
  const pools: string[] = [];
  if (cfg.uppercase) {
    pools.push(cfg.excludeAmbiguous ? filterAmbiguous(UPPER) : UPPER);
  }
  if (cfg.lowercase) {
    pools.push(cfg.excludeAmbiguous ? filterAmbiguous(LOWER) : LOWER);
  }
  if (cfg.numbers) {
    pools.push(cfg.excludeAmbiguous ? filterAmbiguous(DIGITS) : DIGITS);
  }
  if (cfg.symbols) {
    // Symbols don't contain any ambiguous characters but keep the branch
    // symmetrical in case the set grows later.
    pools.push(SYMBOLS);
  }
  const nonEmpty = pools.filter((p) => p.length > 0);
  return {
    pool: nonEmpty.join(''),
    requiredPools: nonEmpty,
  };
};

/**
 * Fisher-Yates shuffle in place using our CSPRNG. Used after injecting one
 * character from each required pool so the guaranteed characters don't always
 * land at the front of the password.
 */
const shuffleInPlace = <T,>(arr: T[]): void => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
};

const generatePassword = (length: number, charset: BuiltCharset): string => {
  const { pool, requiredPools } = charset;
  if (pool.length === 0 || length <= 0) return '';

  // Guarantee at least one character from each enabled pool so the output
  // actually satisfies the user's constraints. When length < pool count we
  // can't meet every constraint — fall back to a fully pooled password.
  const chars: string[] = [];
  if (length >= requiredPools.length) {
    for (const p of requiredPools) {
      chars.push(p[randomIndex(p.length)]!);
    }
    for (let i = requiredPools.length; i < length; i += 1) {
      chars.push(pool[randomIndex(pool.length)]!);
    }
    shuffleInPlace(chars);
  } else {
    for (let i = 0; i < length; i += 1) {
      chars.push(pool[randomIndex(pool.length)]!);
    }
  }
  return chars.join('');
};

const entropyBits = (length: number, charsetSize: number): number => {
  if (charsetSize <= 1 || length <= 0) return 0;
  return length * Math.log2(charsetSize);
};

type StrengthTier = 'weak' | 'good' | 'strong';

const getStrengthTier = (bits: number): StrengthTier => {
  if (bits < 60) return 'weak';
  if (bits < 100) return 'good';
  return 'strong';
};

const strengthLabel: Record<StrengthTier, string> = {
  weak: 'Weak',
  good: 'Good',
  strong: 'Strong',
};

const strengthColorVar: Record<StrengthTier, string> = {
  weak: 'var(--danger)',
  good: 'var(--warning)',
  strong: 'var(--success)',
};

// Normalize an entropy value into a 0..1 width for the meter. 160 bits (the
// cap at length 128 with full symbols) renders as a full bar.
const entropyToBarWidth = (bits: number): number => {
  const cap = 160;
  return Math.max(0, Math.min(1, bits / cap));
};

// ─── Persistence ────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

const sanitizePasswordGenDefaults = (raw: unknown): PasswordGenDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const rawLength = obj.length;
  const safeLength =
    typeof rawLength === 'number' && Number.isFinite(rawLength)
      ? clamp(Math.floor(rawLength), MIN_LENGTH, MAX_LENGTH)
      : DEFAULTS.length;
  const rawBulk = obj.bulkCount;
  const safeBulk =
    typeof rawBulk === 'number' && Number.isFinite(rawBulk)
      ? clamp(Math.floor(rawBulk), MIN_BULK, MAX_BULK)
      : DEFAULTS.bulkCount;
  return {
    length: safeLength,
    uppercase: typeof obj.uppercase === 'boolean' ? obj.uppercase : DEFAULTS.uppercase,
    lowercase: typeof obj.lowercase === 'boolean' ? obj.lowercase : DEFAULTS.lowercase,
    numbers: typeof obj.numbers === 'boolean' ? obj.numbers : DEFAULTS.numbers,
    symbols: typeof obj.symbols === 'boolean' ? obj.symbols : DEFAULTS.symbols,
    excludeAmbiguous:
      typeof obj.excludeAmbiguous === 'boolean'
        ? obj.excludeAmbiguous
        : DEFAULTS.excludeAmbiguous,
    bulkCount: safeBulk,
  };
};

// ─── Strength meter ─────────────────────────────────────────────────────────

function StrengthMeter({ bits }: { bits: number }) {
  const tier = getStrengthTier(bits);
  const width = entropyToBarWidth(bits) * 100;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
        }}
        role="progressbar"
        aria-valuenow={Math.round(bits)}
        aria-valuemin={0}
        aria-valuemax={160}
        aria-label={`Password strength: ${strengthLabel[tier]}`}
      >
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${width}%`,
            backgroundColor: strengthColorVar[tier],
          }}
        />
      </div>
      <span
        className="text-[11px] font-medium uppercase tracking-wide"
        style={{ color: strengthColorVar[tier] }}
      >
        {strengthLabel[tier]}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        {bits.toFixed(0)} bits
      </span>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function PasswordGen() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);
  const clipboard = useClipboard();

  const initial: PasswordGenDefaults = useMemo(
    () => sanitizePasswordGenDefaults(stored),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [length, setLength] = useState<number>(initial.length);
  const [uppercase, setUppercase] = useState<boolean>(initial.uppercase);
  const [lowercase, setLowercase] = useState<boolean>(initial.lowercase);
  const [numbers, setNumbers] = useState<boolean>(initial.numbers);
  const [symbols, setSymbols] = useState<boolean>(initial.symbols);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState<boolean>(initial.excludeAmbiguous);
  const [bulkCount, setBulkCount] = useState<number>(initial.bulkCount);
  const [bulkInput, setBulkInput] = useState<string>(String(initial.bulkCount));
  const [passwords, setPasswords] = useState<string[]>([]);

  // Persist after first render. We explicitly do NOT persist `passwords` —
  // generated credentials are ephemeral by design.
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    update({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: {
          length,
          uppercase,
          lowercase,
          numbers,
          symbols,
          excludeAmbiguous,
          bulkCount,
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous, bulkCount]);

  const atLeastOneType = uppercase || lowercase || numbers || symbols;

  const charset = useMemo(
    () =>
      buildCharset({
        uppercase,
        lowercase,
        numbers,
        symbols,
        excludeAmbiguous,
      }),
    [uppercase, lowercase, numbers, symbols, excludeAmbiguous],
  );

  const charsetSize = charset.pool.length;
  const perPasswordEntropy = useMemo(
    () => entropyBits(length, charsetSize),
    [length, charsetSize],
  );

  const handleGenerate = useCallback(() => {
    if (!atLeastOneType || charsetSize === 0) return;
    const out: string[] = [];
    for (let i = 0; i < bulkCount; i += 1) {
      out.push(generatePassword(length, charset));
    }
    setPasswords(out);
  }, [atLeastOneType, charsetSize, bulkCount, length, charset]);

  const handleCopyOne = useCallback(
    async (value: string) => {
      try {
        await clipboard.write(value);
        // Deliberately keep the toast generic — never mention the payload.
        showToast('Password copied', 'success');
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    },
    [clipboard, showToast],
  );

  const handleBulkChange = (raw: string): void => {
    setBulkInput(raw);
    if (raw.trim() === '') return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setBulkCount(clamp(parsed, MIN_BULK, MAX_BULK));
    }
  };

  const handleBulkBlur = (): void => {
    const parsed = Number.parseInt(bulkInput, 10);
    const safe = Number.isFinite(parsed) ? clamp(parsed, MIN_BULK, MAX_BULK) : MIN_BULK;
    setBulkCount(safe);
    setBulkInput(String(safe));
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const lengthSlider = (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor="password-length"
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Length
        </label>
        <span className="mono text-sm" style={{ color: 'var(--text-primary)' }}>
          {length}
        </span>
      </div>
      <input
        id="password-length"
        type="range"
        min={MIN_LENGTH}
        max={MAX_LENGTH}
        value={length}
        onChange={(e) => setLength(Number.parseInt(e.target.value, 10))}
        className="w-full"
        aria-valuemin={MIN_LENGTH}
        aria-valuemax={MAX_LENGTH}
        aria-valuenow={length}
        style={{ accentColor: 'var(--accent)' }}
      />
      <div
        className="flex justify-between text-[11px]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>{MIN_LENGTH}</span>
        <span>{MAX_LENGTH}</span>
      </div>
    </div>
  );

  const optionsPanel = (
    <div
      className="mb-4 flex flex-col gap-5 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {lengthSlider}

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Toggle checked={uppercase} onChange={setUppercase} label="Uppercase" />
        <Toggle checked={lowercase} onChange={setLowercase} label="Lowercase" />
        <Toggle checked={numbers} onChange={setNumbers} label="Numbers" />
        <Toggle checked={symbols} onChange={setSymbols} label="Symbols" />
        <Toggle
          checked={excludeAmbiguous}
          onChange={setExcludeAmbiguous}
          label="Exclude ambiguous"
        />
      </div>

      {!atLeastOneType && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
          }}
          role="alert"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Enable at least one character type.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-24">
          <Input
            label="Count"
            type="number"
            inputMode="numeric"
            min={MIN_BULK}
            max={MAX_BULK}
            value={bulkInput}
            onChange={(e) => handleBulkChange(e.target.value)}
            onBlur={handleBulkBlur}
            aria-label="Number of passwords to generate"
          />
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={handleGenerate}
          disabled={!atLeastOneType}
          leadingIcon={
            passwords.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )
          }
        >
          {passwords.length > 0 ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
    </div>
  );

  const resultsPanel =
    passwords.length === 0 ? (
      <div
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px dashed var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center"
          style={{
            backgroundColor: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            No passwords yet
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Configure options and click Generate.
          </p>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {passwords.length} {passwords.length === 1 ? 'password' : 'passwords'}
          </span>
          <StrengthMeter bits={perPasswordEntropy} />
        </div>
        <ul
          className="flex max-h-[480px] flex-col overflow-auto"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {passwords.map((pw, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
              style={{
                borderBottom:
                  idx === passwords.length - 1
                    ? 'none'
                    : '1px solid var(--border-secondary)',
              }}
            >
              <code
                className={cn('mono break-all text-xs')}
                style={{ color: 'var(--text-primary)' }}
              >
                {pw}
              </code>
              <button
                type="button"
                onClick={() => handleCopyOne(pw)}
                aria-label={`Copy password ${idx + 1}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center transition-colors"
                style={{
                  color: 'var(--text-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <ToolPage tool={meta}>
      {optionsPanel}
      {resultsPanel}
    </ToolPage>
  );
}

export default PasswordGen;
