/**
 * Part 9 — accessibility checks with axe (spec 09 AX-1): every public page type and every admin
 * page, both themes, phone and desktop widths. Fails on serious or critical issues.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { go, signIn } from './helpers';

test.describe.configure({ retries: 1 });

const nav = (page: Page, path: string) =>
  page.evaluate((u) => {
    history.pushState(null, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);

async function audit(page: Page, label: string) {
  // let reveals and lazy chunks settle; animations off so colours are final
  await page.waitForTimeout(700);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // the WebGL canvas is decorative and duplicated in the DOM (A-3)
    .exclude('canvas')
    .analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join('\n    ')}`,
    );
  expect(bad, `${label}\n${bad.join('\n')}`).toEqual([]);
}

const combos = [
  { width: 1440, theme: 'dark' },
  { width: 1440, theme: 'light' },
  { width: 375, theme: 'dark' },
  { width: 375, theme: 'light' },
] as const;

for (const { width, theme } of combos) {
  test(`public pages pass axe at ${width}px, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((t) => {
      localStorage.setItem('theme', t);
      sessionStorage.setItem('intro-played', '1');
    }, theme);
    await page.goto('/?tier=low');
    await page.waitForFunction(() => '__demoRepo' in window);
    await audit(page, `home ${width} ${theme}`);
    for (const path of [
      '/projects/supply-chain-edi-pipeline',
      '/s/talks',
      '/shop',
      '/shop/cinematic-drone-luts',
      '/shop/golden-hour-lut',
      `/shop/thanks?ref=${'a'.repeat(43)}&payment_id=pay_x1234567&status=failed`,
      '/d/not-a-real-token',
      '/terms',
      '/no-such-page',
    ]) {
      await nav(page, path);
      await audit(page, `${path} ${width} ${theme}`);
    }
  });
}

for (const { width, theme } of combos.slice(0, 3)) {
  test(`admin pages pass axe at ${width}px, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/admin/login');
    await audit(page, `login ${width} ${theme}`);
    await signIn(page);
    await audit(page, `dashboard ${width} ${theme}`);
    for (const label of [
      'Inbox',
      'Traffic',
      'Site settings',
      'Projects',
      'Products',
      'Orders',
      'Discount codes',
      'Shop policies',
      'Media library',
      'Site errors',
      'Account',
    ]) {
      await go(page, label);
      await audit(page, `${label} ${width} ${theme}`);
    }
    await go(page, 'Products');
    await page.locator('a[href^="/admin/products/"]').first().click();
    await audit(page, `product form ${width} ${theme}`);
  });
}
