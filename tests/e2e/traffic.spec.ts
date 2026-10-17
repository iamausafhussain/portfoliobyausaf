/**
 * Part 9 — traffic, error reports, descriptions (spec 09 AC-9.1 – AC-9.4, OP-3, SEO-1), against
 * the demo site: its sample traffic plus what these tests do, reported with the database's rules.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectToast, go, signIn, watchErrors } from './helpers';

test.describe.configure({ retries: 2 });

interface Ev {
  name: string;
  path: string;
  source: string;
  utm_campaign: string | null;
  product_id: string | null;
  visitor: string;
}

const yours = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __demoRepo: { trafficDemo: { events(): Ev[] } } }).__demoRepo.trafficDemo
      .events()
      .filter((e) => e.visitor.startsWith('you-')),
  );

const nav = (page: Page, path: string) =>
  page.evaluate((u) => {
    history.pushState(null, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);

async function visit(page: Page, path: string) {
  await page.addInitScript(() => sessionStorage.setItem('intro-played', '1'));
  await page.goto(path);
  await page.waitForFunction(() => '__demoRepo' in window);
}

test('page views and events are recorded with their source; the admin isn’t (TR-1, TR-3, TR-4)', async ({
  page,
}) => {
  await visit(page, '/shop/cinematic-drone-luts?utm_source=instagram&utm_campaign=reel-1');
  await expect.poll(async () => (await yours(page)).length).toBeGreaterThanOrEqual(1);
  await nav(page, '/shop');
  await page.locator('[data-shop-grid]').waitFor();
  await nav(page, '/shop/cinematic-drone-luts');
  await page.locator('[data-buy]').click();
  await page.locator('[data-demo-checkout]').waitFor();
  const events = await yours(page);
  expect(events.map((e) => `${e.name} ${e.path}`)).toEqual([
    'page_view /shop/cinematic-drone-luts',
    'page_view /shop',
    'page_view /shop/cinematic-drone-luts',
    'buy_click /shop/cinematic-drone-luts',
    'page_view /shop/demo-checkout',
  ]);
  // the visit keeps its source and campaign on later pages
  expect(new Set(events.map((e) => `${e.source}/${e.utm_campaign}`))).toEqual(new Set(['Instagram/reel-1']));
  expect(events.find((e) => e.name === 'buy_click')?.product_id).toBeTruthy();

  await nav(page, '/admin');
  await page.waitForTimeout(500);
  expect((await yours(page)).some((e) => e.path.startsWith('/admin'))).toBe(false);
});

test('browsers that ask not to be tracked aren’t counted (TR-5)', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
  await visit(page, '/shop');
  await page.waitForTimeout(800);
  expect(await yours(page)).toEqual([]);
});

test('admin: Traffic page shows visitors, sources, campaigns, funnel; filters scope everything (TR-7 – TR-9)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await signIn(page);
  await expect(page.locator('[data-visitors-card]')).toContainText('in 7 days');
  await expect(page.locator('[data-status-line]')).toContainText('Database reachable');
  // count this browser again, then arrive from an Instagram campaign link (a reload would reset the demo)
  await page.evaluate(() => localStorage.setItem('analytics-optout', '0'));
  await nav(page, '/shop/cinematic-drone-luts?utm_source=instagram&utm_campaign=reel-2');
  await expect.poll(async () => (await yours(page)).length).toBe(1);
  await nav(page, '/admin');
  await go(page, 'Traffic');

  const visitors = page.locator('[data-stat="Visitors"]');
  await expect(visitors).toContainText(/\d/);
  await expect(page.locator('[data-stat="Right now"]')).not.toContainText('–');
  await expect(page.locator('[data-list="campaigns"]')).toContainText('reel-2');
  await expect(page.locator('[data-list="sources"]')).toContainText('Instagram');
  await expect(page.locator('[data-funnel-row="cinematic-drone-luts"]')).toBeVisible();

  // the chart answers the keyboard, and has a table
  await page.locator('[data-chart] svg').focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-chart] [role="status"]')).toContainText('visitors');
  await page.getByRole('button', { name: 'Show as table' }).click();
  await expect(page.locator('[data-chart] table tbody tr')).toHaveCount(30);

  // filtering by a source changes every number, and can be removed
  const before = (await visitors.textContent()) ?? '';
  await page
    .locator('[data-list="sources"]')
    .getByRole('button', { name: /^Instagram/ })
    .click();
  await expect(page.getByRole('button', { name: /Source: Instagram/ })).toBeVisible();
  await expect(page).toHaveURL(/source=Instagram/);
  await expect(visitors).not.toHaveText(before);
  await page.getByRole('button', { name: /Source: Instagram/ }).click();
  await expect(visitors).toHaveText(before);

  await page.getByRole('button', { name: '7 days' }).click();
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.locator('[data-chart]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('signing in to the admin stops counting this browser; the switch turns it back on (Q3)', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Traffic');
  const sw = page.getByRole('switch', { name: 'Don’t count my visits from this browser' });
  await expect(sw).toBeChecked();
  await nav(page, '/shop');
  await page.waitForTimeout(600);
  expect(await yours(page)).toEqual([]);
  await nav(page, '/admin/traffic');
  await page.getByText('Don’t count my visits from this browser').click();
  await expect(sw).not.toBeChecked();
  await nav(page, '/shop');
  await expect.poll(async () => (await yours(page)).length).toBe(1);
});

test('admin: site errors are grouped, can be marked fixed and cleared (OP-3)', async ({ page }) => {
  await signIn(page);
  // two uncaught errors with the same message, one other
  await page.evaluate(() => {
    for (const m of ['Boom from a test', 'Boom from a test', 'Another test error'])
      setTimeout(() => {
        throw new Error(m);
      });
  });
  await page.waitForTimeout(500);
  await go(page, 'Site errors');
  const boom = page.locator('[data-error="Boom from a test"]');
  await expect(boom).toBeVisible();
  await expect(page.locator('[data-error="Another test error"]')).toBeVisible();
  await expect(
    page.locator('[data-error="WebGL context lost"], [data-error="Error: WebGL context lost"]'),
  ).toContainText('3 times');
  await boom.getByRole('button', { name: 'Mark as fixed' }).click();
  await expect(boom).toHaveAttribute('data-resolved', 'true');
  await page.getByRole('button', { name: /Clear fixed/ }).click();
  await expectToast(page, 'Cleared 1 fixed error.');
  await expect(boom).toHaveCount(0);
});

test('pages describe themselves for search; private pages are noindex (SEO-1)', async ({ page }) => {
  await visit(page, '/shop/cinematic-drone-luts');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /twelve looks/i);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await nav(page, '/no-such-page');
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await nav(page, `/shop/thanks?ref=${'b'.repeat(43)}`);
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await nav(page, '/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
