/**
 * AC-3.17 — every public page at 375 px and 1440 px, dark and light, tiers low/mid/high:
 * no horizontal scrolling, no console errors. Screenshots go to tests/e2e/.results/public.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

const pages = [
  { name: 'home', path: '/' },
  { name: 'project', path: '/projects/supply-chain-edi-pipeline' },
  { name: 'resume', path: '/resume' },
  { name: '404', path: '/nothing-here' },
];

for (const [width, height] of [
  [375, 812],
  [1440, 900],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    for (const tier of ['low', 'mid', 'high'] as const) {
      test(`AC-3.17 public pages at ${width}px, ${scheme}, ${tier}`, async ({ browser }) => {
        test.setTimeout(180_000);
        const ctx = await browser.newContext({
          viewport: { width, height },
          colorScheme: scheme,
          hasTouch: width < 600,
          isMobile: width < 600,
        });
        const page = await ctx.newPage();
        const errors = watchErrors(page);
        const overflow: string[] = [];
        for (const p of pages) {
          await page.goto(`${p.path}${p.path.includes('?') ? '&' : '?'}tier=${tier}`);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(300);
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          if (sw > width) overflow.push(`${p.name}: ${sw}px`);
          if (tier === 'high') {
            await page.screenshot({
              path: `tests/e2e/.results/public/${width}-${scheme}-${p.name}.png`,
              fullPage: true,
            });
          }
        }
        // the open chapter menu too
        await page.goto(`/?tier=${tier}`);
        await page.getByRole('button', { name: 'Chapters' }).click();
        await expect(page.getByRole('dialog', { name: 'Chapters' })).toBeVisible();
        if (tier === 'high') {
          await page.screenshot({ path: `tests/e2e/.results/public/${width}-${scheme}-menu.png` });
        }
        expect(overflow, 'pages wider than the screen').toEqual([]);
        expect(errors, 'console errors').toEqual([]);
        await ctx.close();
      });
    }
  }
}
