/**
 * Accent color presets.
 *
 * Each preset defines the CSS variable overrides for both light and dark themes.
 * The accent is applied by calling `applyAccent(presetId)` which sets CSS custom
 * properties on `document.documentElement`. This works alongside the existing
 * `data-theme` attribute for light/dark switching.
 */

export interface AccentPreset {
  id: string;
  label: string;
  /** Swatch color shown in the picker (light theme value). */
  swatch: string;
  light: AccentValues;
  dark: AccentValues;
}

interface AccentValues {
  accent: string;
  accentHover: string;
  accentActive: string;
  accentSubtle: string;
  accentContrast: string;
  borderFocus: string;
  sidebarBgActive: string;
  sidebarTextActive: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#0d9488',
    light: {
      accent: '#0d9488',
      accentHover: '#0f766e',
      accentActive: '#115e59',
      accentSubtle: 'rgba(13, 148, 136, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#0d9488',
      sidebarBgActive: 'rgba(13, 148, 136, 0.12)',
      sidebarTextActive: '#0d9488',
    },
    dark: {
      accent: '#2dd4bf',
      accentHover: '#5eead4',
      accentActive: '#14b8a6',
      accentSubtle: 'rgba(45, 212, 191, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#2dd4bf',
      sidebarBgActive: 'rgba(45, 212, 191, 0.18)',
      sidebarTextActive: '#5eead4',
    },
  },
  {
    id: 'blue',
    label: 'Ocean Blue',
    swatch: '#2563eb',
    light: {
      accent: '#2563eb',
      accentHover: '#1d4ed8',
      accentActive: '#1e40af',
      accentSubtle: 'rgba(37, 99, 235, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#2563eb',
      sidebarBgActive: 'rgba(37, 99, 235, 0.12)',
      sidebarTextActive: '#2563eb',
    },
    dark: {
      accent: '#60a5fa',
      accentHover: '#93bbfd',
      accentActive: '#3b82f6',
      accentSubtle: 'rgba(96, 165, 250, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#60a5fa',
      sidebarBgActive: 'rgba(96, 165, 250, 0.18)',
      sidebarTextActive: '#93bbfd',
    },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    swatch: '#4f46e5',
    light: {
      accent: '#4f46e5',
      accentHover: '#4338ca',
      accentActive: '#3730a3',
      accentSubtle: 'rgba(79, 70, 229, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#4f46e5',
      sidebarBgActive: 'rgba(79, 70, 229, 0.12)',
      sidebarTextActive: '#4f46e5',
    },
    dark: {
      accent: '#818cf8',
      accentHover: '#a5b4fc',
      accentActive: '#6366f1',
      accentSubtle: 'rgba(129, 140, 248, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#818cf8',
      sidebarBgActive: 'rgba(129, 140, 248, 0.18)',
      sidebarTextActive: '#a5b4fc',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#059669',
    light: {
      accent: '#059669',
      accentHover: '#047857',
      accentActive: '#065f46',
      accentSubtle: 'rgba(5, 150, 105, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#059669',
      sidebarBgActive: 'rgba(5, 150, 105, 0.12)',
      sidebarTextActive: '#059669',
    },
    dark: {
      accent: '#34d399',
      accentHover: '#6ee7b7',
      accentActive: '#10b981',
      accentSubtle: 'rgba(52, 211, 153, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#34d399',
      sidebarBgActive: 'rgba(52, 211, 153, 0.18)',
      sidebarTextActive: '#6ee7b7',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#e11d48',
    light: {
      accent: '#e11d48',
      accentHover: '#be123c',
      accentActive: '#9f1239',
      accentSubtle: 'rgba(225, 29, 72, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#e11d48',
      sidebarBgActive: 'rgba(225, 29, 72, 0.12)',
      sidebarTextActive: '#e11d48',
    },
    dark: {
      accent: '#fb7185',
      accentHover: '#fda4af',
      accentActive: '#f43f5e',
      accentSubtle: 'rgba(251, 113, 133, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#fb7185',
      sidebarBgActive: 'rgba(251, 113, 133, 0.18)',
      sidebarTextActive: '#fda4af',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#d97706',
    light: {
      accent: '#d97706',
      accentHover: '#b45309',
      accentActive: '#92400e',
      accentSubtle: 'rgba(217, 119, 6, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#d97706',
      sidebarBgActive: 'rgba(217, 119, 6, 0.12)',
      sidebarTextActive: '#d97706',
    },
    dark: {
      accent: '#fbbf24',
      accentHover: '#fcd34d',
      accentActive: '#f59e0b',
      accentSubtle: 'rgba(251, 191, 36, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#fbbf24',
      sidebarBgActive: 'rgba(251, 191, 36, 0.18)',
      sidebarTextActive: '#fcd34d',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    swatch: '#475569',
    light: {
      accent: '#475569',
      accentHover: '#334155',
      accentActive: '#1e293b',
      accentSubtle: 'rgba(71, 85, 105, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#475569',
      sidebarBgActive: 'rgba(71, 85, 105, 0.12)',
      sidebarTextActive: '#475569',
    },
    dark: {
      accent: '#94a3b8',
      accentHover: '#cbd5e1',
      accentActive: '#64748b',
      accentSubtle: 'rgba(148, 163, 184, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#94a3b8',
      sidebarBgActive: 'rgba(148, 163, 184, 0.18)',
      sidebarTextActive: '#cbd5e1',
    },
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: '#7c3aed',
    light: {
      accent: '#7c3aed',
      accentHover: '#6d28d9',
      accentActive: '#5b21b6',
      accentSubtle: 'rgba(124, 58, 237, 0.12)',
      accentContrast: '#ffffff',
      borderFocus: '#7c3aed',
      sidebarBgActive: 'rgba(124, 58, 237, 0.12)',
      sidebarTextActive: '#7c3aed',
    },
    dark: {
      accent: '#a78bfa',
      accentHover: '#c4b5fd',
      accentActive: '#8b5cf6',
      accentSubtle: 'rgba(167, 139, 250, 0.18)',
      accentContrast: '#0f1115',
      borderFocus: '#a78bfa',
      sidebarBgActive: 'rgba(167, 139, 250, 0.18)',
      sidebarTextActive: '#c4b5fd',
    },
  },
];

/** Get a preset by ID, falling back to teal. */
export const getAccentPreset = (id: string): AccentPreset =>
  ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0]!;

/**
 * Apply an accent preset to the document. Reads the current theme from
 * `data-theme` to pick the right light/dark variant.
 */
export function applyAccent(presetId: string): void {
  const preset = getAccentPreset(presetId);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const values = isDark ? preset.dark : preset.light;
  const root = document.documentElement.style;

  root.setProperty('--accent', values.accent);
  root.setProperty('--accent-hover', values.accentHover);
  root.setProperty('--accent-active', values.accentActive);
  root.setProperty('--accent-subtle', values.accentSubtle);
  root.setProperty('--accent-contrast', values.accentContrast);
  root.setProperty('--border-focus', values.borderFocus);
  root.setProperty('--sidebar-bg-active', values.sidebarBgActive);
  root.setProperty('--sidebar-text-active', values.sidebarTextActive);
}
