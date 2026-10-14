/**
 * Turns design tokens into CSS custom properties.
 * Pure functions — used at build time by `build/designSystem.ts` and in unit tests.
 */
import { fontRoles, type FontDefinition, type FontRole } from './fonts.ts';
import {
  duration,
  easing,
  fluidRange,
  fontSize,
  fontWeight,
  layout,
  letterSpacing,
  lineHeight,
  radius,
  space,
  themes,
  zIndex,
  type ThemeTokens,
} from './tokens.ts';

/** camelCase → kebab-case, also splitting letters from digits: accent2Text → accent-2-text */
export const kebab = (s: string) =>
  s
    .replace(/([a-z])([0-9])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
const round = (n: number, d = 4) => Number(n.toFixed(d));
const rem = (px: number) => `${round(px / 16)}rem`;

/** clamp() that grows linearly from `min` px at 375px viewport to `max` px at 1440px. */
export function fluid(min: number, max: number): string {
  if (min === max) return rem(min);
  const { minViewport, maxViewport } = fluidRange;
  const slope = (max - min) / (maxViewport - minViewport);
  const intercept = min - slope * minViewport;
  return `clamp(${rem(min)}, ${rem(intercept)} + ${round(slope * 100)}vw, ${rem(max)})`;
}

export function cubicBezier(p: readonly number[]): string {
  return `cubic-bezier(${p.join(', ')})`;
}

/** Variables shared by both themes. */
export function staticVars(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, [min, max]] of Object.entries(fontSize)) v[`--font-size-${k}`] = fluid(min, max);
  for (const [k, n] of Object.entries(fontWeight)) v[`--font-weight-${k}`] = String(n);
  for (const [k, n] of Object.entries(lineHeight)) v[`--line-height-${k}`] = String(n);
  for (const [k, s] of Object.entries(letterSpacing)) v[`--letter-spacing-${k}`] = s;
  for (const [k, n] of Object.entries(space)) v[`--space-${k}`] = rem(n);
  for (const [k, n] of Object.entries(radius)) v[`--radius-${k}`] = n === 999 ? '999px' : rem(n);
  for (const [k, n] of Object.entries(zIndex)) v[`--z-${k}`] = String(n);
  for (const [k, n] of Object.entries(duration)) v[`--dur-${k}`] = `${n}ms`;
  for (const [k, p] of Object.entries(easing)) v[`--ease-${kebab(k)}`] = cubicBezier(p);
  v['--max-width'] = rem(layout.maxWidth);
  v['--gutter'] = fluid(layout.gutter[0], layout.gutter[1]);
  v['--topbar-height'] = rem(layout.topbarHeight);
  return v;
}

/** Variables that change with the theme. */
export function themeVars(t: ThemeTokens): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, c] of Object.entries(t.color)) v[`--color-${kebab(k)}`] = c;
  v['--grain-opacity'] = String(t.effect.grainOpacity);
  v['--globe-glow'] = t.effect.globeGlow ? '1' : '0';
  return v;
}

export function fontVars(
  fonts: Record<FontRole, FontDefinition>,
  fallbackFamily: (role: FontRole) => string,
): Record<string, string> {
  const v: Record<string, string> = {};
  for (const role of fontRoles) {
    const f = fonts[role];
    v[`--font-${role}`] = `'${f.family}', '${fallbackFamily(role)}', ${f.fallbackStack}`;
  }
  return v;
}

const block = (selector: string, vars: Record<string, string>, extra = '') =>
  `${selector} {\n${Object.entries(vars)
    .map(([k, val]) => `  ${k}: ${val};`)
    .join('\n')}${extra ? `\n  ${extra}` : ''}\n}`;

/**
 * Full theme stylesheet.
 * - Dark is the default on `:root`.
 * - OS light preference applies unless the page sets `data-theme="dark"`.
 * - Any element with `data-theme` gets that theme (used by the token preview page and the toggle).
 */
export function buildTokenCss(extraRootVars: Record<string, string> = {}): string {
  const dark = themeVars(themes.dark);
  const light = themeVars(themes.light);
  return [
    block(':root', { ...staticVars(), ...extraRootVars }),
    block(':root,\n[data-theme="dark"]', dark, 'color-scheme: dark;'),
    `@media (prefers-color-scheme: light) {\n${block(
      ':root:not([data-theme="dark"])',
      light,
      'color-scheme: light;',
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}\n}`,
    block('[data-theme="light"]', light, 'color-scheme: light;'),
  ].join('\n\n');
}

export function buildFontFaceCss(fonts: Record<FontRole, FontDefinition>): string {
  return fontRoles
    .flatMap((role) =>
      fonts[role].files.map(
        (file) =>
          `@font-face {\n  font-family: '${fonts[role].family}';\n  src: url('${file.src}') format('woff2');\n  font-weight: ${file.weight};\n  font-style: ${file.style};\n  font-display: swap;${
            file.unicodeRange ? `\n  unicode-range: ${file.unicodeRange};` : ''
          }\n}`,
      ),
    )
    .join('\n\n');
}
