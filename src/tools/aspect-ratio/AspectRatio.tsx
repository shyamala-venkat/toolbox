import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Types & defaults ───────────────────────────────────────────────────────

type Mode = 'calculate' | 'resize';

interface AspectRatioDefaults {
  mode: Mode;
}

const sanitizeDefaults = (raw: unknown): AspectRatioDefaults => {
  if (raw === null || typeof raw !== 'object') return { mode: 'calculate' };
  const obj = raw as Record<string, unknown>;
  return {
    mode: obj.mode === 'calculate' || obj.mode === 'resize' ? obj.mode : 'calculate',
  };
};

// ─── Math helpers ──────────────────────────────────────────────────────────

/** Greatest common divisor via Euclidean algorithm. */
const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
};

const simplifyRatio = (w: number, h: number): { rw: number; rh: number } => {
  if (w <= 0 || h <= 0) return { rw: 0, rh: 0 };
  const d = gcd(w, h);
  return { rw: w / d, rh: h / d };
};

// ─── Presets ───────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  w: number;
  h: number;
  rw: number;
  rh: number;
}

const PRESETS: Preset[] = [
  { name: '16:9 — Widescreen / YouTube / 1080p', w: 1920, h: 1080, rw: 16, rh: 9 },
  { name: '4:3 — Standard / iPad', w: 1024, h: 768, rw: 4, rh: 3 },
  { name: '1:1 — Square / Instagram', w: 1080, h: 1080, rw: 1, rh: 1 },
  { name: '9:16 — Vertical / Stories / Reels', w: 1080, h: 1920, rw: 9, rh: 16 },
  { name: '21:9 — Ultra-wide / Cinema', w: 2560, h: 1080, rw: 21, rh: 9 },
  { name: '3:2 — DSLR Photo', w: 1500, h: 1000, rw: 3, rh: 2 },
  { name: '5:4 — Large Format Photo', w: 1280, h: 1024, rw: 5, rh: 4 },
  { name: '2:1 — Univisium / 18:9', w: 1440, h: 720, rw: 2, rh: 1 },
  { name: '1.91:1 — OG Image / Facebook', w: 1200, h: 630, rw: 1200, rh: 630 },
  { name: '2:3 — Pinterest', w: 1000, h: 1500, rw: 2, rh: 3 },
];

const findMatchingPresets = (rw: number, rh: number): Preset[] => {
  return PRESETS.filter((p) => {
    const pSimplified = simplifyRatio(p.rw, p.rh);
    return pSimplified.rw === rw && pSimplified.rh === rh;
  });
};

// ─── Tab button ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium transition-colors duration-150"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        backgroundColor: 'transparent',
      }}
      aria-selected={active}
      role="tab"
    >
      {children}
    </button>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

function AspectRatio() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState<Mode>(initial.mode);

  // Calculate mode state
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // Resize mode state
  const [ratioW, setRatioW] = useState('16');
  const [ratioH, setRatioH] = useState('9');
  const [knownDim, setKnownDim] = useState<'width' | 'height'>('width');
  const [knownValue, setKnownValue] = useState('1920');

  const debouncedWidth = useDebounce(width, 150);
  const debouncedHeight = useDebounce(height, 150);
  const debouncedRatioW = useDebounce(ratioW, 150);
  const debouncedRatioH = useDebounce(ratioH, 150);
  const debouncedKnownValue = useDebounce(knownValue, 150);

  // Persist mode
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({ toolDefaults: { ...allDefaults, [meta.id]: { mode } satisfies AspectRatioDefaults } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── Calculate mode result ──────────────────────────────────────────────

  const calcResult = useMemo(() => {
    const w = Number.parseInt(debouncedWidth, 10);
    const h = Number.parseInt(debouncedHeight, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const { rw, rh } = simplifyRatio(w, h);
    const decimal = w / h;
    const matchingPresets = findMatchingPresets(rw, rh);
    return { rw, rh, decimal, matchingPresets, w, h };
  }, [debouncedWidth, debouncedHeight]);

  // ─── Resize mode result ─────────────────────────────────────────────────

  const resizeResult = useMemo(() => {
    const rw = Number.parseFloat(debouncedRatioW);
    const rh = Number.parseFloat(debouncedRatioH);
    const val = Number.parseFloat(debouncedKnownValue);
    if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) return null;
    if (!Number.isFinite(val) || val <= 0) return null;

    if (knownDim === 'width') {
      const computedHeight = Math.round((val * rh) / rw);
      return { width: Math.round(val), height: computedHeight };
    }
    const computedWidth = Math.round((val * rw) / rh);
    return { width: computedWidth, height: Math.round(val) };
  }, [debouncedRatioW, debouncedRatioH, debouncedKnownValue, knownDim]);

  const handlePresetClick = useCallback((preset: Preset) => {
    setWidth(String(preset.w));
    setHeight(String(preset.h));
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Tabs */}
        <div
          className="flex"
          role="tablist"
          aria-label="Calculator mode"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <TabButton active={mode === 'calculate'} onClick={() => setMode('calculate')}>
            Calculate Ratio
          </TabButton>
          <TabButton active={mode === 'resize'} onClick={() => setMode('resize')}>
            Find Dimension
          </TabButton>
        </div>

        {mode === 'calculate' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <Input
                  label="Width"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="1920"
                  aria-label="Width in pixels"
                />
              </div>
              <span
                className="pb-2 text-sm font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                :
              </span>
              <div className="w-36">
                <Input
                  label="Height"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="1080"
                  aria-label="Height in pixels"
                />
              </div>
            </div>

            {/* Result */}
            {calcResult && (
              <div
                className="flex flex-col gap-4 p-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {calcResult.rw}:{calcResult.rh}
                  </div>
                  <CopyButton value={`${calcResult.rw}:${calcResult.rh}`} />
                </div>
                <div
                  className="flex flex-wrap gap-x-6 gap-y-1 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>Decimal: {calcResult.decimal.toFixed(4)}</span>
                  <span>{calcResult.w} x {calcResult.h} px</span>
                </div>

                {/* Visual preview */}
                <div className="flex items-center gap-4">
                  <div
                    style={{
                      width: `${Math.min(120, 120 * (calcResult.rw / Math.max(calcResult.rw, calcResult.rh)))}px`,
                      height: `${Math.min(120, 120 * (calcResult.rh / Math.max(calcResult.rw, calcResult.rh)))}px`,
                      backgroundColor: 'var(--accent-subtle)',
                      border: '2px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    aria-label={`Aspect ratio preview ${calcResult.rw}:${calcResult.rh}`}
                    role="img"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Visual proportion
                  </span>
                </div>

                {/* Matching presets */}
                {calcResult.matchingPresets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Matching presets
                    </span>
                    {calcResult.matchingPresets.map((p) => (
                      <div
                        key={p.name}
                        className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!calcResult && (width || height) && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Enter both width and height (positive integers) to calculate the ratio.
              </div>
            )}

            {!width && !height && (
              <div className="flex flex-col gap-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Or choose a common preset
                </span>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.name}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePresetClick(p)}
                    >
                      {p.rw}:{p.rh}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'resize' && (
          <div className="flex flex-col gap-5">
            {/* Ratio input */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-28">
                <Input
                  label="Ratio W"
                  type="number"
                  inputMode="numeric"
                  min={0.01}
                  step="any"
                  value={ratioW}
                  onChange={(e) => setRatioW(e.target.value)}
                  placeholder="16"
                  aria-label="Ratio width component"
                />
              </div>
              <span
                className="pb-2 text-sm font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                :
              </span>
              <div className="w-28">
                <Input
                  label="Ratio H"
                  type="number"
                  inputMode="numeric"
                  min={0.01}
                  step="any"
                  value={ratioH}
                  onChange={(e) => setRatioH(e.target.value)}
                  placeholder="9"
                  aria-label="Ratio height component"
                />
              </div>
            </div>

            {/* Quick ratio presets */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: '16:9', w: '16', h: '9' },
                { label: '4:3', w: '4', h: '3' },
                { label: '1:1', w: '1', h: '1' },
                { label: '9:16', w: '9', h: '16' },
                { label: '21:9', w: '21', h: '9' },
                { label: '3:2', w: '3', h: '2' },
              ].map((r) => (
                <Button
                  key={r.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRatioW(r.w);
                    setRatioH(r.h);
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </div>

            {/* Known dimension */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant={knownDim === 'width' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setKnownDim('width')}
                >
                  Width
                </Button>
                <Button
                  type="button"
                  variant={knownDim === 'height' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setKnownDim('height')}
                >
                  Height
                </Button>
              </div>
              <div className="w-36">
                <Input
                  label={`Known ${knownDim} (px)`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={knownValue}
                  onChange={(e) => setKnownValue(e.target.value)}
                  placeholder="1920"
                  aria-label={`Known ${knownDim} in pixels`}
                />
              </div>
            </div>

            {/* Result */}
            {resizeResult && (
              <div
                className="flex flex-col gap-3 p-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div
                  className="text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {resizeResult.width} x {resizeResult.height} px
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton value={`${resizeResult.width}x${resizeResult.height}`} />
                </div>
              </div>
            )}

            {!resizeResult && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Enter a ratio and a known dimension to calculate the other.
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default AspectRatio;
