/**
 * Design tokens — the single source of truth for colour, type, space, layers and motion.
 *
 * - Emitted as CSS custom properties by `src/theme/css.ts` (injected at build time).
 * - Imported directly by the 3D scene so shaders use the same values.
 *
 * This is the ONLY file in `src/` allowed to contain colour literals (master spec TH-6).
 * See specs/00-master-spec.md §6.
 */

export const themeNames = ['dark', 'light'] as const;
export type ThemeName = (typeof themeNames)[number];

export interface ThemeTokens {
  color: {
    /** Page background */
    bg: string;
    /** Cards, panels */
    bgElevated: string;
    /** Primary text */
    fg: string;
    /** Secondary text */
    fgMuted: string;
    /** Highlights, buttons, packets, focus rings (UI + large text) */
    accent: string;
    /** Accent used as small text / links */
    accentText: string;
    /** Text/icon colour placed on an `accent` background */
    onAccent: string;
    /** Secondary data trails, info states (UI + large text) */
    accent2: string;
    /** Secondary accent used as small text */
    accent2Text: string;
    /** Dividers */
    border: string;
    /** Error states */
    danger: string;
    /** Success states */
    success: string;
    /** Globe base material */
    globeBase: string;
  };
  effect: {
    /** Film grain overlay opacity */
    grainOpacity: number;
    /** Bloom glow on data packets (dark) vs soft shadow (light) */
    globeGlow: boolean;
  };
}

/** Dark — "Night Screening" / Light — "Daylight Edit" */
export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    color: {
      bg: '#0B0B0D',
      bgElevated: '#141418',
      fg: '#EDE8DF',
      fgMuted: '#9A958C',
      accent: '#F57327',
      accentText: '#F57327',
      onAccent: '#0B0B0D',
      accent2: '#49ABE8',
      accent2Text: '#49ABE8',
      border: '#26262C',
      danger: '#E5534B',
      success: '#3FB27F',
      globeBase: '#121216',
    },
    effect: { grainOpacity: 0.08, globeGlow: true },
  },
  light: {
    color: {
      bg: '#F6F2EA',
      bgElevated: '#FFFFFF',
      fg: '#16140F',
      fgMuted: '#5E5A52',
      accent: '#C14E0B',
      accentText: '#9C3F09',
      onAccent: '#FFFFFF',
      accent2: '#1981C8',
      accent2Text: '#13649B',
      border: '#E2DCCF',
      danger: '#B42318',
      success: '#1B7849',
      globeBase: '#EFEAE0',
    },
    effect: { grainOpacity: 0.04, globeGlow: false },
  },
};

/** Default theme when neither the user nor the OS expresses a preference. */
export const defaultTheme: ThemeName = 'dark';

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

/** Viewport widths (px) between which fluid sizes interpolate. */
export const fluidRange = { minViewport: 375, maxViewport: 1440 } as const;

/** Font sizes in px: [size at 375px wide, size at 1440px wide]. Equal values = fixed size. */
export const fontSize = {
  xs: [12, 12],
  sm: [14, 14],
  base: [16, 16],
  lg: [18, 20],
  xl: [22, 28],
  '2xl': [28, 40],
  '3xl': [36, 64],
  hero: [56, 160],
} as const satisfies Record<string, readonly [number, number]>;

export const fontWeight = {
  regular: 400,
  medium: 500,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.05,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.7,
} as const;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  /** Data labels / tech tags (uppercase Inter Medium) */
  label: '0.08em',
} as const;

/* ------------------------------------------------------------------ */
/* Space, shape, layers, layout                                        */
/* ------------------------------------------------------------------ */

/** Spacing scale in px. Keys are step numbers: space-1 = 4px … space-10 = 128px. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 128,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const zIndex = {
  canvas: 0,
  content: 10,
  grain: 20,
  letterbox: 30,
  nav: 40,
  modal: 50,
  toast: 60,
  /** Custom cursor (spec 04): above everything, never receives clicks */
  cursor: 70,
} as const;

export const layout = {
  /** Max content width in px */
  maxWidth: 1280,
  /** Side gutter in px: [mobile, desktop] */
  gutter: [16, 48],
  /** Public top bar height in px (spec 03 NV-1) */
  topbarHeight: 64,
} as const;

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/** Durations in ms */
export const duration = {
  fast: 150,
  base: 300,
  slow: 600,
  scene: 1200,
  /** Upper bound for any transition when prefers-reduced-motion is set */
  reduced: 200,
} as const;

/** Cubic-bezier control points (usable by CSS and GSAP's CustomEase). */
export const easing = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  cinema: [0.7, 0, 0.2, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
