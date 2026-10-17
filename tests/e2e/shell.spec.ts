/** Part 3 — app shell (spec 03 §5), against the demo site. */
import { expect, test, type Page } from '@playwright/test';
import { themes } from '../../src/theme/tokens';
import { DEMO, expectToast, watchErrors } from './helpers';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const timecode = (page: Page) => page.locator('[data-timecode]');

async function scrollIntoMiddle(page: Page, id: string) {
  await page.locator(`#${id}`).waitFor(); // custom sections appear once their data loads
  await page.evaluate((id) => {
    const el = document.getElementById(id)!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - innerHeight / 2 + 40);
  }, id);
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

test('AC-3.1 first paint follows the OS theme, before any app JavaScript runs', async ({ page }) => {
  // block the app bundle: only the inline pre-paint script can set the theme
  await page.route(/\/src\/main\.tsx/, (r) => r.abort());
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await theme(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
});

test('AC-3.2 the choice survives a reload; AC-3.6 theme-color follows', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect.poll(() => theme(page)).toBe('light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', themes.light.color.bg);
  await page.reload();
  expect(await theme(page)).toBe('light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', themes.light.color.bg);
});

test('AC-3.2 with storage blocked the toggle still works for the visit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect.poll(() => theme(page)).toBe('light');
  expect(errors).toEqual([]);
});

test('AC-3.3 with no saved choice, an OS change updates the open page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
});

test('AC-3.4 iris wipe with View Transitions; instant with reduced motion', async ({ page }) => {
  const watchIris = () =>
    page.evaluate(() => {
      const w = window as unknown as { __iris: boolean };
      w.__iris = false;
      new MutationObserver(() => {
        if (document.documentElement.classList.contains('theme-iris')) w.__iris = true;
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  const sawIris = () => page.evaluate(() => (window as unknown as { __iris: boolean }).__iris);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(true);
  await watchIris();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect.poll(sawIris).toBe(true);
  await expect.poll(() => theme(page)).toBe('light');

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await watchIris();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  expect(await theme(page)).toBe('dark'); // switched at once
  await page.waitForTimeout(700);
  expect(await sawIris()).toBe(false);
});

test('AC-3.5 the admin shares the saved theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.goto('/admin/login');
  expect(await theme(page)).toBe('light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
});

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

test('AC-3.7 the timecode names the chapter in the middle of the screen, including a custom section', async ({
  page,
}) => {
  // native scrolling: this test is about the indicator, and scrolls programmatically
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?tier=low');
  const expected: [string, string, string][] = [
    ['about', 'CH 02', 'About'],
    ['projects', 'CH 03', 'The System'],
    ['credits', 'CH 04', 'Credits Roll'],
    ['timeline', 'CH 05', 'Timeline'],
    ['reviews', 'CH 06', 'Reviews'],
    ['s-talks', 'CH 07', 'Talks'],
    ['s-frames', 'CH 08', 'Frames'],
    ['contact', 'CH 09', 'Final Scene'],
  ];
  for (const [id, code, title] of expected) {
    // re-scroll while polling: late images or data above can still shift the layout
    await expect
      .poll(
        async () => {
          await scrollIntoMiddle(page, id);
          await page.waitForTimeout(150);
          return timecode(page).textContent();
        },
        { timeout: 20_000 },
      )
      .toBe(`${code}·${title}`);
  }
});

test('AC-3.8 chapter menu: lists everything, jumps and focuses the heading, Esc closes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Chapters' }).click();
  const menu = page.getByRole('dialog', { name: 'Chapters' });
  await expect(menu).toBeVisible();
  for (const t of [
    'Opening Scene',
    'About',
    'The System',
    'Credits Roll',
    'Timeline',
    'Reviews',
    'Talks',
    'Frames',
    'Final Scene',
  ]) {
    await expect(menu.getByRole('button', { name: new RegExp(t) })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.getByRole('button', { name: 'Chapters' }).click();
  await menu.getByRole('button', { name: /Credits Roll/ }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#credits$/);
  await expect(page.locator('#credits-title')).toBeFocused();
  await expect(page.locator('#credits-title')).toBeInViewport();
});

test('AC-3.9 Fast Lane goes to Projects and Contact, also from a project page', async ({ page }) => {
  await page.goto('/');
  const lane = page.getByRole('navigation', { name: 'Fast lane' }).first();
  await lane.getByRole('button', { name: 'Projects' }).click();
  await expect(page.locator('#projects-title')).toBeInViewport();
  await expect(page).toHaveURL(/#projects$/);

  await page.locator('#projects').getByRole('link', { name: 'Supply-chain EDI pipeline' }).click();
  await expect(page).toHaveURL(/\/projects\/supply-chain-edi-pipeline$/);
  await page
    .getByRole('navigation', { name: 'Fast lane' })
    .first()
    .getByRole('button', { name: 'Contact' })
    .click();
  await expect(page).toHaveURL(/\/#contact$/);
  await expect(page.locator('#contact-title')).toBeInViewport();
});

test('AC-3.9 / PD-1 a resume uploaded in the demo admin shows in the Fast Lane and /resume', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Resume' })).toHaveCount(0);
  // client-side to the admin (a reload would reset the demo data)
  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.getByRole('complementary').getByRole('link', { name: 'Site settings' }).click();
  await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF'),
  });
  await expect(page.getByRole('link', { name: /\.pdf$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expectToast(page, 'Settings saved.');
  // back to the site within the same tab (client-side, keeping the demo data)
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  const resume = page
    .getByRole('navigation', { name: 'Fast lane' })
    .first()
    .getByRole('link', { name: 'Resume' });
  await expect(resume).toBeVisible();
  await expect(resume).toHaveAttribute('target', '_blank');
});

test('AC-3.11 detail routes: published pages render; drafts and unknown slugs are 404', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/projects/supply-chain-edi-pipeline');
  await expect(page.getByRole('heading', { level: 1, name: 'Supply-chain EDI pipeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The problem' })).toBeVisible(); // markdown
  await page.goto('/projects/freelance-dashboard'); // a draft
  await expect(page.getByRole('heading', { level: 1, name: 'Scene not found' })).toBeVisible();
  await page.goto('/projects/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'Scene not found' })).toBeVisible();
  await page.goto('/s/talks'); // published, but "own page" is off
  await expect(page.getByRole('heading', { level: 1, name: 'Scene not found' })).toBeVisible();
  await page.goto('/resume'); // no resume in the demo data
  await expect(page.getByText('The resume isn’t online yet.')).toBeVisible();
  await page.goto('/no/such/page');
  await expect(page).toHaveTitle('Scene not found · Ausaf Hussain');
});

test('AC-3.11 a section with its own page renders its items by field type', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.getByRole('complementary').getByRole('link', { name: 'Manage sections' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Talks', exact: true }).click();
  await page.getByText('Give it its own page').click();
  await page.getByText('Show in the site navigation').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  await page.evaluate(() => {
    history.pushState(null, '', '/s/talks');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Talks' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Scaling EDI on Azure' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Speaking on stage' })).toBeVisible();
  // a select field shows as a tag (spec 06 CS-2)
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: /^Talk$/ })).toBeVisible();
  // and it's in the chapter menu as a page
  await page.getByRole('button', { name: 'Chapters' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Talks' })).toBeVisible();
});

test('AC-3.12 after a route change focus is on the h1 and the title is updated', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  const h1 = page.getByRole('heading', { level: 1, name: 'Drone reel 2026' });
  await expect(h1).toBeFocused();
  await expect(page).toHaveTitle('Drone reel 2026 · Ausaf Hussain');
  await page.getByRole('button', { name: '← Back to The System' }).click();
  await expect(page).toHaveTitle('Ausaf Hussain — Portfolio');
});

/* ------------------------------------------------------------------ */
/* Motion and devices                                                  */
/* ------------------------------------------------------------------ */

const lenisOn = (page: Page) =>
  page.waitForFunction(() => document.documentElement.classList.contains('lenis-on'), null, {
    timeout: 8000,
  });

test('AC-3.13 smooth scroll with a mouse; keyboard scrolling still works', async ({ page }) => {
  await page.goto('/');
  await lenisOn(page);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBeGreaterThan(1500);
});

test('AC-3.13 smooth scroll on touch screens too (decision Q4)', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await lenisOn(page);
  await ctx.close();
});

test('AC-3.13 / AC-3.15 off with reduced motion and in Lite mode; Lite is remembered; grain hidden', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?tier=high');
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.documentElement.classList.contains('lenis-on'))).toBe(false);
  await expect(page.locator('.film-grain')).toBeHidden();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?tier=high');
  await lenisOn(page);
  await expect(page.locator('.film-grain')).toBeVisible();
  await page.locator('footer').getByText('Lite mode').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tier)).toBe('low');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis-on')))
    .toBe(false);
  await expect(page.locator('.film-grain')).toBeHidden();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.tier)).toBe('low');
  await expect(page.locator('footer').getByRole('switch')).toBeChecked();
});

test('AC-3.14 ?tier= overrides detection', async ({ page }) => {
  for (const t of ['low', 'mid', 'high']) {
    await page.goto(`/?tier=${t}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tier)).toBe(t);
  }
});

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

test('AC-3.18 keyboard: skip link first, controls reachable, menu traps focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const reached = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    reached.add(
      await page.evaluate(
        () =>
          document.activeElement?.textContent?.trim() ||
          document.activeElement?.getAttribute('aria-label') ||
          '',
      ),
    );
  }
  expect([...reached]).toEqual(expect.arrayContaining(['Ausaf Hussain', 'Projects', 'Contact', 'Chapters']));
  expect([...reached].some((r) => /^Switch to (light|dark) theme$/.test(r))).toBe(true);

  await page.getByRole('button', { name: 'Chapters' }).focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: 'Chapters' });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(
      await menu.evaluate(
        (d) => d.contains(document.activeElement) || document.activeElement === document.body,
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Chapters' })).toBeFocused();
});
