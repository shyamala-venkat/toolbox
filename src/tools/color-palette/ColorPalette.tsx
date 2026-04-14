import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { ToolPage } from '@/components/tool/ToolPage';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { useClipboard } from '@/hooks/useClipboard';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { meta } from './meta';

// ─── Color math ────────────────────────────────────────────────────────────
// Pure HSL math: hex -> RGB -> HSL, rotate/adjust, HSL -> RGB -> hex.
// All hue values are in degrees [0,360), saturation and lightness in [0,100].

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const parseHex = (input: string): { r: number; g: number; b: number } | null => {
  const raw = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw) && !/^[0-9a-fA-F]{3}$/.test(raw)) return null;

  if (raw.length === 3) {
    return {
      r: Number.parseInt(raw[0]! + raw[0]!, 16),
      g: Number.parseInt(raw[1]! + raw[1]!, 16),
      b: Number.parseInt(raw[2]! + raw[2]!, 16),
    };
  }
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
};

const rgbToHsl = (r: number, g: number, b: number): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToHex = (h: number, s: number, l: number): string => {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }

  const toHex = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

// ─── Palette generators ────────────────────────────────────────────────────

interface PaletteType {
  name: string;
  generate: (hsl: Hsl) => string[];
}

const PALETTE_TYPES: PaletteType[] = [
  {
    name: 'Complementary',
    generate: ({ h, s, l }) => [
      hslToHex(h, s, l),
      hslToHex(h, Math.max(0, s - 15), Math.min(95, l + 15)),
      hslToHex((h + 180) % 360, s, l),
      hslToHex((h + 180) % 360, Math.max(0, s - 15), Math.min(95, l + 15)),
      hslToHex((h + 180) % 360, Math.min(100, s + 10), Math.max(5, l - 15)),
    ],
  },
  {
    name: 'Analogous',
    generate: ({ h, s, l }) => [
      hslToHex((h - 30 + 360) % 360, s, l),
      hslToHex((h - 15 + 360) % 360, s, l),
      hslToHex(h, s, l),
      hslToHex((h + 15) % 360, s, l),
      hslToHex((h + 30) % 360, s, l),
    ],
  },
  {
    name: 'Triadic',
    generate: ({ h, s, l }) => [
      hslToHex(h, s, l),
      hslToHex(h, Math.max(0, s - 20), Math.min(95, l + 20)),
      hslToHex((h + 120) % 360, s, l),
      hslToHex((h + 240) % 360, s, l),
      hslToHex((h + 240) % 360, Math.max(0, s - 20), Math.min(95, l + 20)),
    ],
  },
  {
    name: 'Split-Complementary',
    generate: ({ h, s, l }) => [
      hslToHex(h, s, l),
      hslToHex(h, Math.max(0, s - 10), Math.min(95, l + 15)),
      hslToHex((h + 150) % 360, s, l),
      hslToHex((h + 210) % 360, s, l),
      hslToHex((h + 180) % 360, Math.max(0, s - 10), Math.min(95, l + 10)),
    ],
  },
  {
    name: 'Monochromatic',
    generate: ({ h, s, l }) => [
      hslToHex(h, s, Math.max(5, l - 30)),
      hslToHex(h, s, Math.max(5, l - 15)),
      hslToHex(h, s, l),
      hslToHex(h, s, Math.min(95, l + 15)),
      hslToHex(h, s, Math.min(95, l + 30)),
    ],
  },
];

// ─── Persistence ───────────────────────────────────────────────────────────

interface ColorPaletteDefaults {
  hex: string;
}

const sanitizeDefaults = (raw: unknown): ColorPaletteDefaults => {
  if (raw === null || typeof raw !== 'object') return { hex: '#4F46E5' };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.hex === 'string' && parseHex(obj.hex) !== null) {
    return { hex: obj.hex };
  }
  return { hex: '#4F46E5' };
};

// ─── Swatch with copy ──────────────────────────────────────────────────────

function Swatch({
  hex,
  isBase,
}: {
  hex: string;
  isBase?: boolean;
}) {
  const clipboard = useClipboard();
  const showToast = useAppStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await clipboard.write(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [clipboard, hex, showToast]);

  // Determine a readable text color against the swatch background
  const parsed = parseHex(hex);
  const textBright = parsed
    ? (parsed.r * 299 + parsed.g * 587 + parsed.b * 114) / 1000 < 128
    : false;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group flex flex-col items-center gap-2 transition-transform duration-100 hover:scale-105"
      aria-label={`Copy ${hex}`}
      title={`Click to copy ${hex}`}
    >
      <div
        className="relative flex h-20 w-full items-center justify-center"
        style={{
          // User-controlled color preview — hard-coded is required here.
          backgroundColor: hex,
          borderRadius: 'var(--radius-md)',
          border: isBase ? '3px solid var(--accent)' : '1px solid var(--border-primary)',
          minWidth: '80px',
        }}
      >
        <span
          className="flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: textBright ? '#ffffff' : '#000000' }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        {hex}
      </span>
    </button>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

function ColorPalette() {
  const stored = useSettingsStore((s) => s.preferences.toolDefaults[meta.id]);
  const updateStore = useSettingsStore((s) => s.update);

  const initial = useMemo(() => sanitizeDefaults(stored), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [hexInput, setHexInput] = useState(initial.hex);
  const debouncedHex = useDebounce(hexInput, 200);

  // Parse the input color
  const parsedColor = useMemo(() => {
    const rgb = parseHex(debouncedHex);
    if (!rgb) return null;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const normalizedHex = hslToHex(hsl.h, hsl.s, hsl.l);
    return { hsl, hex: normalizedHex };
  }, [debouncedHex]);

  // Generate palettes
  const palettes = useMemo(() => {
    if (!parsedColor) return null;
    return PALETTE_TYPES.map((pt) => ({
      name: pt.name,
      colors: pt.generate(parsedColor.hsl),
    }));
  }, [parsedColor]);

  // Picker value needs #rrggbb lowercase
  const pickerValue = useMemo(() => {
    const rgb = parseHex(hexInput);
    if (!rgb) return '#4f46e5';
    const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
  }, [hexInput]);

  // Persist after mount
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) {
      setDidMount(true);
      return;
    }
    if (!parsedColor) return;
    const allDefaults = useSettingsStore.getState().preferences.toolDefaults;
    updateStore({
      toolDefaults: {
        ...allDefaults,
        [meta.id]: { hex: hexInput } satisfies ColorPaletteDefaults,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedHex]);

  const handleHexChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setHexInput(e.target.value);
  }, []);

  const handlePickerChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setHexInput(e.target.value.toUpperCase());
  }, []);

  const isInvalid = hexInput.length > 0 && !parseHex(hexInput);

  return (
    <ToolPage tool={meta}>
      <div className="flex flex-col gap-6">
        {/* Color input */}
        <div
          className="flex flex-wrap items-end gap-4 p-4"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="flex items-end gap-3">
            <div
              className="relative"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-secondary)',
                overflow: 'hidden',
              }}
            >
              {/* User-controlled color preview swatch */}
              <div
                aria-label={`Selected color preview ${parsedColor?.hex ?? hexInput}`}
                role="img"
                className="h-full w-full"
                style={{ backgroundColor: parsedColor?.hex ?? pickerValue }}
              />
              <input
                type="color"
                value={pickerValue}
                onChange={handlePickerChange}
                aria-label="Color picker"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <div className="w-36">
              <Input
                label="Hex Color"
                type="text"
                value={hexInput}
                onChange={handleHexChange}
                placeholder="#4F46E5"
                spellCheck={false}
                autoComplete="off"
                error={isInvalid ? 'Invalid hex color' : undefined}
                aria-label="Hex color input"
              />
            </div>
          </div>

          {parsedColor && (
            <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span>
                HSL: {parsedColor.hsl.h}, {parsedColor.hsl.s}%, {parsedColor.hsl.l}%
              </span>
            </div>
          )}
        </div>

        {/* Palettes */}
        {palettes ? (
          <div className="flex flex-col gap-6">
            {palettes.map((palette) => (
              <div key={palette.name} className="flex flex-col gap-3">
                <h2
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {palette.name}
                </h2>
                <div className="grid grid-cols-5 gap-3">
                  {palette.colors.map((hex, i) => (
                    <Swatch
                      key={`${palette.name}-${i}`}
                      hex={hex}
                      isBase={i === 0 && palette.name !== 'Analogous' ? true : (palette.name === 'Analogous' && i === 2)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-4 text-center text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Enter a valid hex color to generate palettes.
          </div>
        )}
      </div>
    </ToolPage>
  );
}

export default ColorPalette;
