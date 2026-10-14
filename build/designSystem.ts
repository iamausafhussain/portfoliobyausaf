/**
 * Vite plugin: injects the design system into index.html before first paint.
 *
 *  - @font-face rules for every file in src/theme/fonts.ts
 *  - metric-matched fallback faces (computed from the actual font files, so a font swap
 *    never causes layout shift — master spec FT-5)
 *  - --font-* variables and every design token as CSS custom properties
 *  - <link rel="preload"> for fonts marked `preload: true`
 *
 * Editing tokens.ts or fonts.ts restarts the dev server automatically (they are config deps).
 */
import path from 'node:path';
import { createFontStack } from '@capsizecss/core';
import { fromFile } from '@capsizecss/unpack/fs';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { buildFontFaceCss, buildTokenCss, fontVars } from '../src/theme/css.ts';
import { fontRoles, fonts, type FontRole } from '../src/theme/fonts.ts';
import { buildThemeScript, themeColor } from '../src/theme/themeScript.ts';
import { defaultTheme } from '../src/theme/tokens.ts';

type Metrics = Parameters<typeof createFontStack>[0][number];

async function loadSystemMetrics(key: string): Promise<Metrics> {
  try {
    const mod = (await import(`@capsizecss/metrics/${key}`)) as { default: Metrics };
    return mod.default;
  } catch (e) {
    throw new Error(
      `[design-system] Unknown fallbackMetrics "${key}" in src/theme/fonts.ts. ` +
        `Use a key from @capsizecss/metrics, e.g. "arial", "timesNewRoman", "georgia".`,
      { cause: e },
    );
  }
}

const fallbackFamily = (role: FontRole) => `${fonts[role].family} Fallback`;

export async function buildDesignSystemCss(publicDir: string): Promise<string> {
  const fallbackFaces: string[] = [];
  for (const role of fontRoles) {
    const def = fonts[role];
    const file = path.join(publicDir, def.files[0].src);
    let fontMetrics: Metrics;
    try {
      fontMetrics = await fromFile(file);
    } catch (e) {
      throw new Error(`[design-system] Could not read font file "${file}" for role "${role}"`, { cause: e });
    }
    const system = await loadSystemMetrics(def.fallbackMetrics);
    const { fontFaces } = createFontStack([{ ...fontMetrics, familyName: def.family }, system]);
    fallbackFaces.push(fontFaces.replace(`"${def.family} Fallback"`, `'${fallbackFamily(role)}'`));
  }

  return [
    buildFontFaceCss(fonts),
    fallbackFaces.join('\n\n'),
    buildTokenCss(fontVars(fonts, fallbackFamily)),
  ].join('\n\n');
}

export function designSystem(): Plugin {
  let publicDir = 'public';
  let css = '';
  return {
    name: 'design-system',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    async buildStart() {
      css = await buildDesignSystemCss(publicDir);
    },
    transformIndexHtml: {
      order: 'pre',
      async handler() {
        if (!css) css = await buildDesignSystemCss(publicDir);
        const preloads: HtmlTagDescriptor[] = fontRoles
          .filter((r) => fonts[r].preload)
          .map((r) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: fonts[r].files[0].src,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head-prepend',
          }));
        return [
          // runs before first paint: picks the theme (spec 03 TS-1)
          {
            tag: 'meta',
            attrs: { name: 'theme-color', content: themeColor(defaultTheme) },
            injectTo: 'head-prepend',
          },
          { tag: 'script', children: buildThemeScript(), injectTo: 'head-prepend' },
          ...preloads,
          { tag: 'style', attrs: { id: 'design-tokens' }, children: `\n${css}\n`, injectTo: 'head' },
        ];
      },
    },
  };
}
