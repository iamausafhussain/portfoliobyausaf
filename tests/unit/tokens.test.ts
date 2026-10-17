import { describe, expect, it } from 'vitest';
import { AA, contrastRatio } from '../../src/theme/contrast';
import { buildTokenCss, fluid } from '../../src/theme/css';
import { fontSize, themeNames, themes, type ThemeTokens } from '../../src/theme/tokens';

type ColourKey = keyof ThemeTokens['color'];

/**
 * AC-0.3 — every text/background pair in master spec §6.1 passes WCAG AA for its intended use.
 * [foreground, background, minimum ratio, why]
 */
const pairs: [ColourKey, ColourKey, number, string][] = [
  ['fg', 'bg', AA.text, 'body text'],
  ['fg', 'bgElevated', AA.text, 'body text on cards'],
  ['fgMuted', 'bg', AA.text, 'secondary text'],
  ['fgMuted', 'bgElevated', AA.text, 'secondary text on cards'],
  ['accentText', 'bg', AA.text, 'links / accent text'],
  ['accentText', 'bgElevated', AA.text, 'links on cards'],
  ['accent2Text', 'bg', AA.text, 'secondary accent text'],
  ['accent2Text', 'bgElevated', AA.text, 'secondary accent text on cards'],
  ['onAccent', 'accent', AA.text, 'button labels'],
  ['accent', 'bg', AA.ui, 'focus rings, UI, large text'],
  ['accent2', 'bg', AA.ui, 'data trails, UI'],
  ['danger', 'bg', AA.text, 'error messages'],
  ['success', 'bg', AA.text, 'success messages'],
  ['chart1', 'bgElevated', AA.ui, 'chart lines (Traffic)'],
  ['chart2', 'bgElevated', AA.ui, 'chart lines (Traffic)'],
];

describe('colour contrast (AC-0.3)', () => {
  for (const theme of themeNames) {
    for (const [fg, bg, min, why] of pairs) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}:1 (${why})`, () => {
        const c = themes[theme].color;
        expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe('token CSS', () => {
  const css = buildTokenCss();

  it('emits every colour token for both themes', () => {
    for (const theme of themeNames) {
      for (const value of Object.values(themes[theme].color)) expect(css).toContain(value);
    }
  });

  it('names variables in kebab-case as in the spec', () => {
    expect(css).toContain('--color-accent-2:');
    expect(css).toContain('--color-accent-2-text:');
    expect(css).toContain('--color-bg-elevated:');
    expect(css).toContain('--font-size-2xl:');
  });

  it('every var(--…) used in src/ is defined', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const { buildDesignSystemCss } = await import('../../build/designSystem');
    const all = await buildDesignSystemCss(path.resolve(__dirname, '../../public'));
    const defined = new Set([...all.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const f = path.join(d, n);
        return statSync(f).isDirectory() ? walk(f) : /\.(css|tsx?)$/.test(n) ? [f] : [];
      });
    const files = walk(path.resolve(__dirname, '../../src'));
    // component-local variables count too: declared in CSS (`--x:`) or set from TSX (`'--x':`)
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['\s{;(](--[a-z0-9-]+)'?\s*:/g))
        if (m[1]) defined.add(m[1]);
    }
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        if (m[1] && !m[1].includes('${') && !defined.has(m[1]))
          missing.push(`${m[1]} in ${path.basename(f)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('emits every font size', () => {
    for (const key of Object.keys(fontSize)) expect(css).toContain(`--font-size-${key}:`);
  });

  it('defaults to dark and honours data-theme and the OS preference', () => {
    expect(css).toContain(':root,\n[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('@media (prefers-color-scheme: light)');
  });

  it('fluid sizes hit their min and max', () => {
    expect(fluid(16, 16)).toBe('1rem');
    expect(fluid(56, 160)).toMatch(/^clamp\(3\.5rem, .+, 10rem\)$/);
  });
});
