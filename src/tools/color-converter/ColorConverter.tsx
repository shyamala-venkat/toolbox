import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { ToolPage } from '@/components/tool/ToolPage';
import { CopyButton } from '@/components/ui/CopyButton';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';
import {
  parseHex,
  parseRgbString,
  parseHslString,
  parseHsvString,
  parseCmykString,
  formatHex,
  formatRgb,
  formatHsl,
  formatHsv,
  formatCmyk,
  contrastGrades,
  rgbaEquals,
  WHITE,
  BLACK,
  type Rgba,
  type ContrastGrades,
} from './color';

// ─── Types ──────────────────────────────────────────────────────────────────

type FieldKey = 'hex' | 'rgb' | 'hsl' | 'hsv' | 'cmyk';

interface ColorConverterDefaults {
  hex: string;
}

const DEFAULT_COLOR: Rgba = { r: 99, g: 102, b: 241, a: 1 }; // indigo-500-ish
const DEFAULTS: ColorConverterDefaults = {
  hex: formatHex(DEFAULT_COLOR),
};

interface FieldState {
  value: string;
  invalid: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Defense-in-depth: validate persisted default, fall back on anything weird.
const sanitizeColorConverterDefaults = (raw: unknown): ColorConverterDefaults => {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULTS };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.hex === 'string' && parseHex(obj.hex) !== null) {
    return { hex: obj.hex };
  }
  return { ...DEFAULTS };
};

const formatAll = (rgba: Rgba): Record<FieldKey, string> => ({
  hex: formatHex(rgba),
  rgb: formatRgb(rgba),
  hsl: formatHsl(rgba),
  hsv: formatHsv(rgba),
  cmyk: formatCmyk(rgba),
});

const parseField = (key: FieldKey, value: string): Rgba | null => {
  switch (key) {
    case 'hex':
      return parseHex(value);
    case 'rgb':
      return parseRgbString(value);
    case 'hsl':
      return parseHslString(value);
    case 'hsv':
      return parseHsvString(value);
    case 'cmyk':
      return parseCmykString(value);
  }
};

const FIELD_META: Array<{ key: FieldKey; label: string; placeholder: string }> = [
  { key: 'hex', label: 'HEX', placeholder: '#6366F1' },
  { key: 'rgb', label: 'RGB', placeholder: 'rgb(99, 102, 241)' },
  { key: 'hsl', label: 'HSL', placeholder: 'hsl(239, 84%, 67%)' },
  { key: 'hsv', label: 'HSV', placeholder: 'hsv(239, 59%, 95%)' },
  { key: 'cmyk', label: 'CMYK', placeholder: 'cmyk(59%, 58%, 0%, 5%)' },
];

// Tiny helper for the native color input: it only accepts #rrggbb.
const toPickerHex = (rgba: Rgba): string => {
  const hex = formatHex({ ...rgba, a: 1 });
  return hex.slice(0, 7).toLowerCase();
};

// ─── Contrast pill ──────────────────────────────────────────────────────────

interface ContrastCardProps {
  label: string;
  swatchBackground: string;
  swatchForeground: string;
  grades: ContrastGrades;
}

function ContrastCard({
  label,
  swatchBackground,
  swatchForeground,
  grades,
}: ContrastCardProps) {
  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <span className="mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {grades.ratio.toFixed(2)}:1
        </span>
      </div>
      <div
        className="flex h-14 items-center justify-center text-base font-semibold"
        style={{
          // User-controlled color preview — this is the only place we accept
          // hard-coded style colors, and even here they're driven by the
          // user's input, not the design system.
          backgroundColor: swatchBackground,
          color: swatchForeground,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-secondary)',
        }}
      >
        Aa sample
      </div>
      <div className="flex flex-wrap gap-1.5">
        <GradeBadge label="AA normal" passed={grades.aaNormal} />
        <GradeBadge label="AA large" passed={grades.aaLarge} />
        <GradeBadge label="AAA normal" passed={grades.aaaNormal} />
        <GradeBadge label="AAA large" passed={grades.aaaLarge} />
      </div>
    </div>
  );
}

function GradeBadge({ label, passed }: { label: string; passed: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        backgroundColor: passed ? 'var(--accent-subtle)' : 'var(--bg-primary)',
        color: passed ? 'var(--success)' : 'var(--text-tertiary)',
        border: `1px solid ${passed ? 'var(--success)' : 'var(--border-secondary)'}`,
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {label} {passed ? '✓' : '✕'}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function ColorConverter() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const update = useSettingsStore((s) => s.update);

  const initialColor = useMemo<Rgba>(() => {
    const defaults = sanitizeColorConverterDefaults(stored);
    return parseHex(defaults.hex) ?? DEFAULT_COLOR;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [color, setColor] = useState<Rgba>(initialColor);

  // Each field owns its own editable string so a mid-typing user doesn't get
  // reformatted under their cursor.
  const [fields, setFields] = useState<Record<FieldKey, FieldState>>(() => {
    const formatted = formatAll(initialColor);
    return {
      hex: { value: formatted.hex, invalid: false },
      rgb: { value: formatted.rgb, invalid: false },
      hsl: { value: formatted.hsl, invalid: false },
      hsv: { value: formatted.hsv, invalid: false },
      cmyk: { value: formatted.cmyk, invalid: false },
    };
  });

  // Track which field the user is actively editing so we don't blow their
  // text away by reformatting when the color updates from elsewhere.
  const editingRef = useRef<FieldKey | null>(null);

  // If the user Alt-Tabs (or otherwise focuses another window) while editing,
  // the input's `onBlur` may not fire — leaving `editingRef` stuck. A stuck
  // ref means the next color update silently skips reformatting that field.
  // Listening for window blur clears the ref so the next update reformats
  // every field as expected.
  useEffect(() => {
    const handleWindowBlur = () => {
      editingRef.current = null;
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, []);

  // Whenever the canonical color changes, reformat every field EXCEPT the one
  // the user is currently typing in.
  useEffect(() => {
    const formatted = formatAll(color);
    setFields((prev) => {
      const next: Record<FieldKey, FieldState> = { ...prev };
      for (const key of Object.keys(formatted) as FieldKey[]) {
        if (editingRef.current === key) continue;
        next[key] = { value: formatted[key], invalid: false };
      }
      return next;
    });
  }, [color]);

  // Persist the picked color after mount.
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
        [meta.id]: { hex: formatHex(color) },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  const handleFieldChange = useCallback(
    (key: FieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      editingRef.current = key;
      const parsed = parseField(key, value);
      if (parsed === null) {
        setFields((prev) => ({ ...prev, [key]: { value, invalid: true } }));
        return;
      }
      setFields((prev) => ({ ...prev, [key]: { value, invalid: false } }));
      if (!rgbaEquals(parsed, color)) {
        setColor(parsed);
      }
    },
    [color],
  );

  const handleFieldBlur = useCallback(() => {
    editingRef.current = null;
  }, []);

  const handlePickerChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseHex(e.target.value);
    if (parsed === null) return;
    editingRef.current = null;
    setColor(parsed);
  }, []);

  const hexForSwatch = formatHex(color);
  const pickerValue = toPickerHex(color);

  const contrastVsWhite = useMemo(() => contrastGrades(color, WHITE), [color]);
  const contrastVsBlack = useMemo(() => contrastGrades(color, BLACK), [color]);

  // ─── Sub-renders ──────────────────────────────────────────────────────────

  const pickerPanel = (
    <div
      className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="relative"
          style={{
            width: '120px',
            height: '120px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)',
            overflow: 'hidden',
          }}
        >
          {/* User-controlled preview swatch: hard-coded background color is
              allowed here because it's driven by user input, not design. */}
          <div
            aria-label={`Selected color preview ${hexForSwatch}`}
            role="img"
            className="h-full w-full"
            style={{ backgroundColor: hexForSwatch }}
          />
          <input
            type="color"
            value={pickerValue}
            onChange={handlePickerChange}
            aria-label="Color picker"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Click swatch to open picker
          </span>
          <span className="mono text-sm" style={{ color: 'var(--text-primary)' }}>
            {hexForSwatch}
          </span>
        </div>
      </div>
    </div>
  );

  const fieldsPanel = (
    <div className="flex flex-col gap-3">
      {FIELD_META.map(({ key, label, placeholder }) => {
        const state = fields[key];
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label
              htmlFor={`color-converter-${key}`}
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {label}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div
                  className="relative flex items-center"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `1px solid ${state.invalid ? 'var(--danger)' : 'var(--border-primary)'}`,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <input
                    id={`color-converter-${key}`}
                    type="text"
                    value={state.value}
                    placeholder={placeholder}
                    onChange={handleFieldChange(key)}
                    onBlur={handleFieldBlur}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={state.invalid || undefined}
                    className="mono h-9 w-full bg-transparent px-3 text-sm outline-none placeholder:opacity-60"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <CopyButton value={state.value} disabled={state.invalid} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const contrastPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Contrast
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          WCAG 2.1
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ContrastCard
          label="Text on white"
          swatchBackground={formatHex(WHITE)}
          swatchForeground={hexForSwatch}
          grades={contrastVsWhite}
        />
        <ContrastCard
          label="Text on black"
          swatchBackground={formatHex(BLACK)}
          swatchForeground={hexForSwatch}
          grades={contrastVsBlack}
        />
      </div>
    </div>
  );

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {pickerPanel}
        {fieldsPanel}
        {contrastPanel}
      </div>
    </ToolPage>
  );
}

export default ColorConverter;
