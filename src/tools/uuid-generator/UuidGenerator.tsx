import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { CopyButton } from '@/components/ui/CopyButton';
import { useClipboard } from '@/hooks/useClipboard';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types ──────────────────────────────────────────────────────────────────

type UuidVersion = 'v1' | 'v4' | 'v7';

interface UuidGeneratorDefaults {
  version: UuidVersion;
  count: number;
  hyphens: boolean;
  uppercase: boolean;
}

const DEFAULTS: UuidGeneratorDefaults = {
  version: 'v4',
  count: 1,
  hyphens: true,
  uppercase: false,
};

const MIN_COUNT = 1;
const MAX_COUNT = 100;

// ─── UUID generation ────────────────────────────────────────────────────────

const getRandomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const byteToHex: string[] = [];
for (let i = 0; i < 256; i += 1) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}

const formatBytesAsUuid = (bytes: Uint8Array): string => {
  // Standard 8-4-4-4-12 layout. Caller is responsible for setting version
  // and variant bits before calling this.
  return (
    byteToHex[bytes[0]!]! +
    byteToHex[bytes[1]!]! +
    byteToHex[bytes[2]!]! +
    byteToHex[bytes[3]!]! +
    '-' +
    byteToHex[bytes[4]!]! +
    byteToHex[bytes[5]!]! +
    '-' +
    byteToHex[bytes[6]!]! +
    byteToHex[bytes[7]!]! +
    '-' +
    byteToHex[bytes[8]!]! +
    byteToHex[bytes[9]!]! +
    '-' +
    byteToHex[bytes[10]!]! +
    byteToHex[bytes[11]!]! +
    byteToHex[bytes[12]!]! +
    byteToHex[bytes[13]!]! +
    byteToHex[bytes[14]!]! +
    byteToHex[bytes[15]!]!
  );
};

// v1 state — keeps a stable random node ID and clock sequence per session
// (per RFC 4122 §4.5: a random 48-bit node with the multicast bit set is
// acceptable when no MAC address is available).
let v1NodeBytes: Uint8Array | null = null;
let v1ClockSeq = 0;
let v1LastTimestamp = -1;
let v1ClockSeqInitialized = false;

const ensureV1State = (): void => {
  if (!v1NodeBytes) {
    v1NodeBytes = getRandomBytes(6);
    // Set the multicast bit on the first byte to indicate this is not a
    // real MAC address.
    v1NodeBytes[0] = (v1NodeBytes[0]! | 0x01) & 0xff;
  }
  if (!v1ClockSeqInitialized) {
    const seqBytes = getRandomBytes(2);
    v1ClockSeq = ((seqBytes[0]! << 8) | seqBytes[1]!) & 0x3fff;
    v1ClockSeqInitialized = true;
  }
};

const generateV1 = (): string => {
  ensureV1State();
  const node = v1NodeBytes!;

  // RFC 4122 timestamp: 100-nanosecond intervals since 1582-10-15.
  // Offset between Unix epoch (1970-01-01) and Gregorian epoch (1582-10-15)
  // is 12219292800 seconds = 122192928000000000 100-ns intervals.
  // We use BigInt to keep precision.
  const millis = BigInt(Date.now());
  // Add a sub-millisecond counter (random 0-9999) to reduce collisions in a
  // single ms. We draw from `crypto.getRandomValues` to stay consistent with
  // the rest of the file — v1 UUIDs are inherently leaky, but there's no
  // reason to fall back to a non-cryptographic RNG when a CSPRNG is already
  // available.
  const subMsRaw = new Uint16Array(1);
  crypto.getRandomValues(subMsRaw);
  const subMs = BigInt(subMsRaw[0]! % 10000);
  const timestamp = millis * 10000n + 122192928000000000n + subMs;

  // If clock went backwards, bump the clock sequence per the RFC.
  const tsNumber = Number(millis);
  if (tsNumber <= v1LastTimestamp) {
    v1ClockSeq = (v1ClockSeq + 1) & 0x3fff;
  }
  v1LastTimestamp = tsNumber;

  const timeLow = Number(timestamp & 0xffffffffn);
  const timeMid = Number((timestamp >> 32n) & 0xffffn);
  const timeHi = Number((timestamp >> 48n) & 0x0fffn);

  const bytes = new Uint8Array(16);
  bytes[0] = (timeLow >>> 24) & 0xff;
  bytes[1] = (timeLow >>> 16) & 0xff;
  bytes[2] = (timeLow >>> 8) & 0xff;
  bytes[3] = timeLow & 0xff;
  bytes[4] = (timeMid >>> 8) & 0xff;
  bytes[5] = timeMid & 0xff;
  // Version 1: high nibble of byte 6 is 0001.
  bytes[6] = ((timeHi >>> 8) & 0x0f) | 0x10;
  bytes[7] = timeHi & 0xff;
  // Variant 10xx in the high bits of byte 8.
  bytes[8] = ((v1ClockSeq >>> 8) & 0x3f) | 0x80;
  bytes[9] = v1ClockSeq & 0xff;
  bytes[10] = node[0]!;
  bytes[11] = node[1]!;
  bytes[12] = node[2]!;
  bytes[13] = node[3]!;
  bytes[14] = node[4]!;
  bytes[15] = node[5]!;

  return formatBytesAsUuid(bytes);
};

const generateV4 = (): string => {
  // Prefer the platform implementation when available — it's the strongest
  // guarantee of correctness.
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  return formatBytesAsUuid(bytes);
};

const generateV7 = (): string => {
  // RFC 9562 §5.7 — 48-bit Unix millisecond timestamp, version, then random.
  const millis = Date.now();
  const bytes = new Uint8Array(16);
  // Pack the 48-bit timestamp into bytes 0..5.
  // JS bitwise operators are 32-bit, so split into high/low.
  const high = Math.floor(millis / 0x100000000);
  const low = millis >>> 0;
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  // Fill the remaining bytes with randomness.
  const random = getRandomBytes(10);
  for (let i = 0; i < 10; i += 1) {
    bytes[6 + i] = random[i]!;
  }
  // Set version (7) in the upper nibble of byte 6.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Set RFC 4122 variant (10xx) in the upper bits of byte 8.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatBytesAsUuid(bytes);
};

const generateBatch = (version: UuidVersion, count: number): string[] => {
  const result: string[] = [];
  const fn =
    version === 'v1' ? generateV1 : version === 'v7' ? generateV7 : generateV4;
  for (let i = 0; i < count; i += 1) {
    result.push(fn());
  }
  return result;
};

const transform = (uuid: string, hyphens: boolean, uppercase: boolean): string => {
  let out = hyphens ? uuid : uuid.replace(/-/g, '');
  if (uppercase) out = out.toUpperCase();
  return out;
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

// Defense-in-depth: a manually edited preferences.json could ship anything
// for our defaults blob. Validate every field against its runtime shape and
// silently fall back to the hard-coded defaults when something is off.
const isUuidVersion = (value: unknown): value is UuidVersion =>
  value === 'v1' || value === 'v4' || value === 'v7';

const sanitizeUuidGeneratorDefaults = (raw: unknown): UuidGeneratorDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const rawCount = obj.count;
  const safeCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? clamp(Math.floor(rawCount), MIN_COUNT, MAX_COUNT)
      : DEFAULTS.count;
  return {
    version: isUuidVersion(obj.version) ? obj.version : DEFAULTS.version,
    count: safeCount,
    hyphens: typeof obj.hyphens === 'boolean' ? obj.hyphens : DEFAULTS.hyphens,
    uppercase: typeof obj.uppercase === 'boolean' ? obj.uppercase : DEFAULTS.uppercase,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

function UuidGenerator() {
  // Subscribe to just this tool's slice of tool_defaults so unrelated tools
  // persisting their own defaults don't cause a re-render here. Zustand
  // compares the returned reference, and `settingsStore.update()` creates a
  // fresh nested object only for the tool that actually changed.
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);
  const showToast = useAppStore((s) => s.showToast);
  const clipboard = useClipboard();

  const initial: UuidGeneratorDefaults = useMemo(
    () => sanitizeUuidGeneratorDefaults(stored),
    // Read once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [version, setVersion] = useState<UuidVersion>(initial.version);
  const [count, setCount] = useState<number>(initial.count);
  const [countInput, setCountInput] = useState<string>(String(initial.count));
  const [hyphens, setHyphens] = useState<boolean>(initial.hyphens);
  const [uppercase, setUppercase] = useState<boolean>(initial.uppercase);
  const [results, setResults] = useState<string[]>([]);

  // Persist defaults when options change (skip first mount). We read
  // `toolDefaults` from the live store via `getState()` so this component
  // doesn't subscribe to the whole map.
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
          version,
          count,
          hyphens,
          uppercase,
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, count, hyphens, uppercase]);

  const handleGenerate = useCallback(() => {
    const safeCount = clamp(count, MIN_COUNT, MAX_COUNT);
    setResults(generateBatch(version, safeCount));
  }, [version, count]);

  const handleCountChange = (raw: string): void => {
    setCountInput(raw);
    if (raw.trim() === '') return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setCount(clamp(parsed, MIN_COUNT, MAX_COUNT));
    }
  };

  const handleCountBlur = (): void => {
    const parsed = Number.parseInt(countInput, 10);
    const safe = Number.isFinite(parsed) ? clamp(parsed, MIN_COUNT, MAX_COUNT) : MIN_COUNT;
    setCount(safe);
    setCountInput(String(safe));
  };

  const formattedResults = useMemo(
    () => results.map((u) => transform(u, hyphens, uppercase)),
    [results, hyphens, uppercase],
  );

  const allText = formattedResults.join('\n');

  const handleCopyOne = useCallback(
    async (value: string) => {
      try {
        await clipboard.write(value);
        showToast('UUID copied', 'success');
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    },
    [clipboard, showToast],
  );

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  const versionPicker = (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        Version
      </span>
      <div
        className="inline-flex p-1"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
        }}
        role="radiogroup"
        aria-label="UUID version"
      >
        {(
          [
            { value: 'v1', label: 'v1', hint: 'time + node' },
            { value: 'v4', label: 'v4', hint: 'random' },
            { value: 'v7', label: 'v7', hint: 'time-ordered' },
          ] as const
        ).map((opt) => {
          const active = version === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVersion(opt.value)}
              title={opt.hint}
              className="px-3 py-1 text-xs font-medium uppercase transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-tertiary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const optionsPanel = (
    <div
      className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {versionPicker}

      <div className="flex w-24 flex-col">
        <Input
          label="Count"
          type="number"
          inputMode="numeric"
          min={MIN_COUNT}
          max={MAX_COUNT}
          value={countInput}
          onChange={(e) => handleCountChange(e.target.value)}
          onBlur={handleCountBlur}
          aria-label="Number of UUIDs to generate"
        />
      </div>

      <div className="flex flex-col gap-3">
        <Toggle checked={hyphens} onChange={setHyphens} label="Hyphens" />
        <Toggle checked={uppercase} onChange={setUppercase} label="Uppercase" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={handleGenerate}
          leadingIcon={
            results.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )
          }
        >
          {results.length > 0 ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
    </div>
  );

  const resultsPanel =
    results.length === 0 ? (
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
            No UUIDs yet
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Pick a version and click Generate.
          </p>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {formattedResults.length}{' '}
            {formattedResults.length === 1 ? 'UUID' : 'UUIDs'}
          </span>
          <CopyButton value={allText} label="Copy all" successLabel="Copied all" />
        </div>
        <ul
          className="flex max-h-[480px] flex-col overflow-auto"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {formattedResults.map((uuid, idx) => (
            <li
              key={`${uuid}-${idx}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={{
                borderBottom:
                  idx === formattedResults.length - 1
                    ? 'none'
                    : '1px solid var(--border-secondary)',
              }}
            >
              <code
                className="mono truncate text-xs"
                style={{ color: 'var(--text-primary)' }}
                title={uuid}
              >
                {uuid}
              </code>
              <button
                type="button"
                onClick={() => handleCopyOne(uuid)}
                aria-label={`Copy UUID ${idx + 1}`}
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

export default UuidGenerator;
