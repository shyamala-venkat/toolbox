/**
 * Pure color math for the color-converter tool.
 *
 * The canonical color representation is { r, g, b, a } with integer channels
 * in [0,255] and alpha in [0,1]. Every parser returns this shape (or null on
 * failure) and every formatter reads from it. HSL/HSV/CMYK conversions round
 * to the closest integer — the tool is for humans, not color science, so the
 * small rounding drift is invisible and makes the inputs much easier to read.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundInt = (value: number): number => Math.round(value);

// ─── Parsers ────────────────────────────────────────────────────────────────

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
export function parseHex(input: string): Rgba | null {
  const raw = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;

  if (raw.length === 3 || raw.length === 4) {
    const r = Number.parseInt(raw[0]! + raw[0]!, 16);
    const g = Number.parseInt(raw[1]! + raw[1]!, 16);
    const b = Number.parseInt(raw[2]! + raw[2]!, 16);
    const a =
      raw.length === 4 ? Number.parseInt(raw[3]! + raw[3]!, 16) / 255 : 1;
    return { r, g, b, a };
  }
  if (raw.length === 6 || raw.length === 8) {
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

/** Parse `rgb(r, g, b)` or `rgba(r, g, b, a)`, tolerating whitespace. */
export function parseRgbString(input: string): Rgba | null {
  const match = /^rgba?\(\s*([^)]*)\)$/i.exec(input.trim());
  if (!match || !match[1]) return null;
  const parts = match[1].split(/[,\s/]+/).filter((p) => p.length > 0);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [rs, gs, bs, as] = parts;
  if (!rs || !gs || !bs) return null;
  const r = Number.parseInt(rs, 10);
  const g = Number.parseInt(gs, 10);
  const b = Number.parseInt(bs, 10);
  const a = as === undefined ? 1 : Number.parseFloat(as);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(a)) {
    return null;
  }
  if (r < 0 || g < 0 || b < 0 || r > 255 || g > 255 || b > 255) return null;
  if (a < 0 || a > 1) return null;
  return { r, g, b, a };
}

/** Parse `hsl(h, s%, l%)`. */
export function parseHslString(input: string): Rgba | null {
  const match = /^hsla?\(\s*([^)]*)\)$/i.exec(input.trim());
  if (!match || !match[1]) return null;
  const parts = match[1].split(/[,\s/]+/).filter((p) => p.length > 0);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [hs, ss, ls, as] = parts;
  if (!hs || !ss || !ls) return null;
  const h = Number.parseFloat(hs);
  const s = Number.parseFloat(ss.replace('%', ''));
  const l = Number.parseFloat(ls.replace('%', ''));
  const a = as === undefined ? 1 : Number.parseFloat(as);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l) || !Number.isFinite(a)) {
    return null;
  }
  if (s < 0 || s > 100 || l < 0 || l > 100) return null;
  if (a < 0 || a > 1) return null;
  const rgb = hslToRgb({ h, s, l });
  return { ...rgb, a };
}

/** Parse `hsv(h, s%, v%)`. */
export function parseHsvString(input: string): Rgba | null {
  const match = /^hsva?\(\s*([^)]*)\)$/i.exec(input.trim());
  if (!match || !match[1]) return null;
  const parts = match[1].split(/[,\s/]+/).filter((p) => p.length > 0);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [hs, ss, vs, as] = parts;
  if (!hs || !ss || !vs) return null;
  const h = Number.parseFloat(hs);
  const s = Number.parseFloat(ss.replace('%', ''));
  const v = Number.parseFloat(vs.replace('%', ''));
  const a = as === undefined ? 1 : Number.parseFloat(as);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(v) || !Number.isFinite(a)) {
    return null;
  }
  if (s < 0 || s > 100 || v < 0 || v > 100) return null;
  if (a < 0 || a > 1) return null;
  const rgb = hsvToRgb({ h, s, v });
  return { ...rgb, a };
}

/** Parse `cmyk(c%, m%, y%, k%)`. */
export function parseCmykString(input: string): Rgba | null {
  const match = /^cmyk\(\s*([^)]*)\)$/i.exec(input.trim());
  if (!match || !match[1]) return null;
  const parts = match[1].split(/[,\s/]+/).filter((p) => p.length > 0);
  if (parts.length !== 4) return null;
  const [cs, ms, ys, ks] = parts;
  if (!cs || !ms || !ys || !ks) return null;
  const c = Number.parseFloat(cs.replace('%', ''));
  const m = Number.parseFloat(ms.replace('%', ''));
  const y = Number.parseFloat(ys.replace('%', ''));
  const k = Number.parseFloat(ks.replace('%', ''));
  if (!Number.isFinite(c) || !Number.isFinite(m) || !Number.isFinite(y) || !Number.isFinite(k)) {
    return null;
  }
  if (c < 0 || c > 100 || m < 0 || m > 100 || y < 0 || y > 100 || k < 0 || k > 100) {
    return null;
  }
  return cmykToRgb({ c, m, y, k });
}

// ─── Converters ─────────────────────────────────────────────────────────────

export function rgbToHsl({ r, g, b }: Rgba): Hsl {
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
    h: roundInt(h * 360),
    s: roundInt(s * 100),
    l: roundInt(l * 100),
  };
}

export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;

  const hueToRgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  if (sn === 0) {
    const v = roundInt(ln * 255);
    return { r: v, g: v, b: v };
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: roundInt(hueToRgb(p, q, hn + 1 / 3) * 255),
    g: roundInt(hueToRgb(p, q, hn) * 255),
    b: roundInt(hueToRgb(p, q, hn - 1 / 3) * 255),
  };
}

export function rgbToHsv({ r, g, b }: Rgba): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
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
    h: roundInt(h * 360),
    s: roundInt(s * 100),
    v: roundInt(v * 100),
  };
}

export function hsvToRgb({ h, s, v }: Hsv): { r: number; g: number; b: number } {
  const hn = (((h % 360) + 360) % 360) / 60;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;

  const i = Math.floor(hn);
  const f = hn - i;
  const p = vn * (1 - sn);
  const q = vn * (1 - f * sn);
  const t = vn * (1 - (1 - f) * sn);

  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = vn;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = vn;
      b = p;
      break;
    case 2:
      r = p;
      g = vn;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = vn;
      break;
    case 4:
      r = t;
      g = p;
      b = vn;
      break;
    case 5:
      r = vn;
      g = p;
      b = q;
      break;
  }
  return {
    r: roundInt(r * 255),
    g: roundInt(g * 255),
    b: roundInt(b * 255),
  };
}

export function rgbToCmyk({ r, g, b }: Rgba): Cmyk {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return {
    c: roundInt(c * 100),
    m: roundInt(m * 100),
    y: roundInt(y * 100),
    k: roundInt(k * 100),
  };
}

export function cmykToRgb({ c, m, y, k }: Cmyk): Rgba {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;
  return {
    r: roundInt(255 * (1 - cn) * (1 - kn)),
    g: roundInt(255 * (1 - mn) * (1 - kn)),
    b: roundInt(255 * (1 - yn) * (1 - kn)),
    a: 1,
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

const toHex2 = (n: number): string =>
  clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function formatHex({ r, g, b, a }: Rgba): string {
  const hex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  if (a >= 1) return hex.toUpperCase();
  return `${hex}${toHex2(a * 255)}`.toUpperCase();
}

export function formatRgb({ r, g, b, a }: Rgba): string {
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function formatHsl(rgba: Rgba): string {
  const { h, s, l } = rgbToHsl(rgba);
  if (rgba.a >= 1) return `hsl(${h}, ${s}%, ${l}%)`;
  return `hsla(${h}, ${s}%, ${l}%, ${Number(rgba.a.toFixed(3))})`;
}

export function formatHsv(rgba: Rgba): string {
  const { h, s, v } = rgbToHsv(rgba);
  return `hsv(${h}, ${s}%, ${v}%)`;
}

export function formatCmyk(rgba: Rgba): string {
  const { c, m, y, k } = rgbToCmyk(rgba);
  return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
}

// ─── Contrast ───────────────────────────────────────────────────────────────

/** Relative luminance per WCAG 2.1. */
function relativeLuminance({ r, g, b }: Rgba): number {
  const toLinear = (v: number): number => {
    const vn = v / 255;
    return vn <= 0.03928 ? vn / 12.92 : Math.pow((vn + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastGrades {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export function contrastGrades(fg: Rgba, bg: Rgba): ContrastGrades {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** Equality check used to keep live syncing stable. */
export function rgbaEquals(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 1e-6;
}
