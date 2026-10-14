/**
 * Fonts — the ONLY place font choices live (master spec §6.2.1).
 *
 * To change a font:
 *   1. Put the new .woff2 file(s) in `public/fonts/`.
 *   2. Edit `family` and `files` for the role below (and `fallbackMetrics` if the new
 *      font is a sans-serif instead of a serif, or vice versa).
 *   3. Restart `npm run dev`.
 *
 * Everything else is generated from this file at build time: @font-face rules, the
 * metric-matched fallback faces (no layout shift while the font loads), the
 * `--font-italic` / `--font-body` CSS variables and the <link rel="preload"> tags.
 *
 * Components never name a font. They use the role variables, e.g.
 *   font-family: var(--font-italic);
 */

export const fontRoles = ['italic', 'body'] as const;
export type FontRole = (typeof fontRoles)[number];

export interface FontFile {
  /** Path under /public, e.g. '/fonts/inter.woff2' */
  src: string;
  /** Single weight ('400') or variable range ('100 900') */
  weight: string;
  style: 'normal' | 'italic';
  /** Comma-separated unicode-range (optional) */
  unicodeRange?: string;
}

export interface FontDefinition {
  /** Family name used in CSS. Any name works; it does not need to match the file's internal name. */
  family: string;
  files: FontFile[];
  /**
   * Local system font whose metrics are adjusted to match this font while it loads.
   * Must be a key from @capsizecss/metrics (e.g. 'arial', 'timesNewRoman', 'georgia').
   */
  fallbackMetrics: string;
  /** Generic stack appended after the adjusted fallback. */
  fallbackStack: string;
  /** Preload the first file (true for fonts visible above the fold). */
  preload: boolean;
}

/** Latin subset (Basic Latin, Latin-1, common punctuation and symbols). */
const latin =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

export const fonts: Record<FontRole, FontDefinition> = {
  /**
   * Italic display: title cards, chapter names, pull quotes, emphasis.
   * EB Garamond Italic (SIL OFL) stands in for Apple Garamond, which is not licensed for web use.
   */
  italic: {
    family: 'EB Garamond',
    files: [
      {
        src: '/fonts/eb-garamond-latin-italic-variable.woff2',
        weight: '400 800',
        style: 'italic',
        unicodeRange: latin,
      },
    ],
    fallbackMetrics: 'timesNewRoman',
    fallbackStack: "Georgia, 'Times New Roman', serif",
    preload: true,
  },

  /** Body / UI: Regular 400, Medium 500, Bold 700. */
  body: {
    family: 'Inter',
    files: [
      {
        src: '/fonts/inter-latin-variable.woff2',
        weight: '100 900',
        style: 'normal',
        unicodeRange: latin,
      },
    ],
    fallbackMetrics: 'arial',
    fallbackStack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    preload: true,
  },
};
