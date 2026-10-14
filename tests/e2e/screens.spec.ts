/**
 * AC-2.26 — every admin screen at 375 px and 1440 px, dark and light:
 * no horizontal scrolling, no console errors. Screenshots go to tests/e2e/.results/screens.
 */
import { expect, test } from '@playwright/test';
import { go, signIn, watchErrors } from './helpers';

const screens: { name: string; open: (p: import('@playwright/test').Page) => Promise<void> }[] = [
  { name: 'dashboard', open: (p) => go(p, 'Dashboard') },
  { name: 'settings', open: (p) => go(p, 'Site settings') },
  { name: 'hero', open: (p) => go(p, 'Hero media') },
  {
    name: 'hero-edit',
    open: async (p) => {
      await go(p, 'Hero media');
      await p.getByRole('link', { name: 'Demo drone reel' }).click();
    },
  },
  { name: 'projects', open: (p) => go(p, 'Projects') },
  {
    name: 'project-edit',
    open: async (p) => {
      await go(p, 'Projects');
      await p.getByRole('link', { name: 'Supply-chain EDI pipeline' }).click();
    },
  },
  { name: 'achievements', open: (p) => go(p, 'Achievements') },
  {
    name: 'experience-edit',
    open: async (p) => {
      await go(p, 'Experience');
      await p.getByRole('link', { name: /Senior Officer/ }).click();
    },
  },
  { name: 'skills', open: (p) => go(p, 'Skills') },
  {
    name: 'testimonial-edit',
    open: async (p) => {
      await go(p, 'Testimonials');
      await p.getByRole('link', { name: 'Demo Client' }).click();
    },
  },
  { name: 'sections', open: (p) => go(p, 'Manage sections') },
  {
    name: 'section-builder',
    open: async (p) => {
      await go(p, 'Manage sections');
      await p.getByRole('main').getByRole('link', { name: 'Talks', exact: true }).click();
    },
  },
  { name: 'section-items', open: (p) => go(p, 'Talks') },
  {
    name: 'item-edit',
    open: async (p) => {
      await go(p, 'Talks');
      await p.getByRole('link', { name: 'Scaling EDI on Azure' }).click();
    },
  },
  { name: 'media', open: (p) => go(p, 'Media library') },
  { name: 'account', open: (p) => go(p, 'Account') },
];

for (const [width, height] of [
  [375, 812],
  [1440, 900],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`AC-2.26 all screens at ${width}px, ${scheme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      const errors = watchErrors(page);

      await page.goto('/admin/login');
      await page.screenshot({
        path: `tests/e2e/.results/screens/${width}-${scheme}-login.png`,
        fullPage: true,
      });
      await signIn(page);

      const overflow: string[] = [];
      for (const s of screens) {
        await s.open(page);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(250);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        if (scrollWidth > width) overflow.push(`${s.name}: ${scrollWidth}px`);
        await page.screenshot({
          path: `tests/e2e/.results/screens/${width}-${scheme}-${s.name}.png`,
          fullPage: true,
        });
      }
      expect(overflow, 'pages wider than the screen').toEqual([]);
      expect(errors, 'console errors').toEqual([]);
    });
  }
}
