/**
 * AC-0.6 — changing `family` and `files` in fonts.ts updates the generated CSS
 * with no other file edited. Also checks FT-1 / FT-5 output.
 */
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const publicDir = path.resolve(__dirname, '../../public');

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../src/theme/fonts');
});

describe('design system CSS (FT-1, FT-5)', () => {
  it('generates @font-face, metric-matched fallbacks and role variables from fonts.ts', async () => {
    const { buildDesignSystemCss } = await import('../../build/designSystem');
    const { fonts } = await import('../../src/theme/fonts');
    const css = await buildDesignSystemCss(publicDir);

    for (const def of Object.values(fonts)) {
      expect(css).toContain(`font-family: '${def.family}';`);
      expect(css).toContain(`url('${def.files[0]?.src}')`);
      expect(css).toContain(`font-family: '${def.family} Fallback';`);
    }
    expect(css).toMatch(/size-adjust: [\d.]+%/);
    expect(css).toMatch(/ascent-override: [\d.]+%/);
    expect(css).toContain("--font-italic: 'EB Garamond', 'EB Garamond Fallback'");
    expect(css).toContain("--font-body: 'Inter', 'Inter Fallback'");
  });
});

describe('font swap (AC-0.6)', () => {
  it('swapping the italic font in fonts.ts is reflected everywhere', async () => {
    vi.doMock('../../src/theme/fonts', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../src/theme/fonts')>();
      return {
        ...original,
        fonts: {
          ...original.fonts,
          italic: {
            family: 'Test Serif',
            // any woff2 works for the test; reuse the body file
            files: [{ src: '/fonts/inter-latin-variable.woff2', weight: '400', style: 'italic' as const }],
            fallbackMetrics: 'georgia',
            fallbackStack: 'serif',
            preload: false,
          },
        },
      };
    });
    const { buildDesignSystemCss } = await import('../../build/designSystem');
    const css = await buildDesignSystemCss(publicDir);

    expect(css).toContain("--font-italic: 'Test Serif', 'Test Serif Fallback', serif");
    expect(css).toContain("font-family: 'Test Serif';");
    expect(css).toContain("src: local('Georgia')");
    expect(css).not.toContain('EB Garamond');
  });

  it('gives a clear error for an unknown fallback font', async () => {
    vi.doMock('../../src/theme/fonts', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../src/theme/fonts')>();
      return {
        ...original,
        fonts: { ...original.fonts, body: { ...original.fonts.body, fallbackMetrics: 'notAFont' } },
      };
    });
    const { buildDesignSystemCss } = await import('../../build/designSystem');
    await expect(buildDesignSystemCss(publicDir)).rejects.toThrow(/Unknown fallbackMetrics "notAFont"/);
  });
});
