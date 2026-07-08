// ─── Color palette type ───────────────────────────────────────────────────────

export type ColorPalette = {
  bg: { base: string; surface: string; card: string; elevated: string };
  primary:      string;
  primaryLight: string;
  primaryDark:  string;
  cyan:         string;
  cyanLight:    string;
  cyanDark:     string;
  xpGold:       string;
  xpOrange:     string;
  success:      string;
  danger:       string;
  warning:      string;
  pink:         string;
  text: { primary: string; secondary: string; muted: string };
  border:      string;
  borderHover: string;
  glass:       string;
  glassBorder: string;
};

// ─── Dark theme (default) ─────────────────────────────────────────────────────

export const DARK_COLORS: ColorPalette = {
  bg: {
    base:     '#070714',
    surface:  '#0E0E24',
    card:     '#13132E',
    elevated: '#1A1A3A',
  },
  primary:      '#7C3AED',
  primaryLight: '#9F67F7',
  primaryDark:  '#5B21B6',
  cyan:         '#06B6D4',
  cyanLight:    '#22D3EE',
  cyanDark:     '#0891B2',
  xpGold:       '#FBBF24',
  xpOrange:     '#F97316',
  success:      '#10B981',
  danger:       '#EF4444',
  warning:      '#F59E0B',
  pink:         '#EC4899',
  text: {
    primary:   '#F1F5F9',
    secondary: '#94A3B8',
    muted:     '#475569',
  },
  border:      'rgba(255,255,255,0.07)',
  borderHover: 'rgba(255,255,255,0.14)',
  glass:       'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(255,255,255,0.10)',
};

// ─── Light theme ──────────────────────────────────────────────────────────────

export const LIGHT_COLORS: ColorPalette = {
  bg: {
    base:     '#F0EFF8',
    surface:  '#FFFFFF',
    card:     '#F5F4FD',
    elevated: '#EAE9F5',
  },
  primary:      '#7C3AED',
  primaryLight: '#6D28D9',
  primaryDark:  '#5B21B6',
  cyan:         '#0891B2',
  cyanLight:    '#0E7490',
  cyanDark:     '#155E75',
  xpGold:       '#B45309',
  xpOrange:     '#C2410C',
  success:      '#059669',
  danger:       '#DC2626',
  warning:      '#B45309',
  pink:         '#BE185D',
  text: {
    primary:   '#0F0F1E',
    secondary: '#374151',
    muted:     '#6B7280',
  },
  border:      'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.15)',
  glass:       'rgba(0,0,0,0.03)',
  glassBorder: 'rgba(0,0,0,0.09)',
};

// ─── Backward-compat default export (dark) ───────────────────────────────────

export const colors = DARK_COLORS;

// ─── Spacing / radii / font sizes (theme-independent) ────────────────────────

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const;

export const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;

export const fontSizes = {
  xs:  10,
  sm:  12,
  md:  14,
  lg:  16,
  xl:  18,
  xxl: 22,
  h2:  26,
  h1:  32,
  display: 42,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  }),
} as const;
