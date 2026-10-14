/**
 * Part 4 — Opening Scene and cursor (spec 04 §5), against the demo site.
 * This browser renders WebGL in software, so particle tests use the mid tier, a small
 * window and the development-only `?noguard` switch (the frame guard would rightly stop
 * a software renderer).
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { toRgb } from '../../src/scene/hero/sampling';
import { themes } from '../../src/theme/tokens';
import { DEMO, demo, watchErrors } from './helpers';

// video and WebGL run in software here, so give slow moments room
test.describe.configure({ retries: 2, timeout: 120_000 });

const hero = (page: Page) => page.locator('[data-intro]');
const intro = (page: Page) => hero(page).getAttribute('data-intro');
const video = (page: Page) => page.locator('[data-hero-video]');
const canvas = (page: Page) => page.locator('canvas[data-hero-particles]');
const cursor = (page: Page) => page.locator('[data-custom-cursor]');

async function signInDemo(page: Page) {
  await demo(page, 'auth.signIn', DEMO.email, 'any-password');
  const setup = await demo<{ factorId: string }>(page, 'auth.startTotpSetup');
  await demo(page, 'auth.finishTotpSetup', setup.factorId, DEMO.code);
}

/** Change a setting in the demo backend and refresh the page's data without a reload. */
async function setPlayback(page: Page, mode: 'single' | 'sequence' | 'random') {
  await page.waitForFunction(() => '__demoRepo' in window && '__queryClient' in window);
  await signInDemo(page);
  const s = await demo<{ updated_at: string }>(page, 'data.getSettings');
  await demo(page, 'data.updateSettings', { hero_playback: mode }, s.updated_at);
  await page.evaluate(() =>
    (
      window as unknown as { __queryClient: { invalidateQueries(): Promise<void> } }
    ).__queryClient.invalidateQueries(),
  );
}

/* ------------------------------------------------------------------ */
/* Intro                                                               */
/* ------------------------------------------------------------------ */

test('AC-4.1 the intro plays once (≈2.4 s); a reload in the same session shows the final frame', async ({
  page,
}) => {
  // timestamps taken inside the page: when the hero appears mid-intro and when it ends
  await page.addInitScript(() => {
    const w = window as unknown as { __introStart?: number; __introEnd?: number };
    new MutationObserver(() => {
      const v = document.querySelector('[data-intro]')?.getAttribute('data-intro');
      if (v === 'full') w.__introStart ??= performance.now();
      if (v === 'done' && w.__introStart) w.__introEnd ??= performance.now();
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-intro'],
    });
  });
  await page.goto('/?tier=low');
  await expect.poll(() => intro(page), { timeout: 8000 }).toBe('done');
  const ms = await page.evaluate(() => {
    const w = window as unknown as { __introStart: number; __introEnd: number };
    return w.__introEnd - w.__introStart;
  });
  expect(ms).toBeGreaterThan(2300);
  expect(ms).toBeLessThan(3200);
  await page.reload();
  await hero(page).waitFor();
  expect(await intro(page)).toBe('done');
});

for (const [name, act] of [
  [
    'scroll',
    async (p: Page) => {
      await p.mouse.move(600, 400);
      await p.mouse.wheel(0, 300);
    },
  ],
  ['click', (p: Page) => p.mouse.click(700, 300)],
  ['key', (p: Page) => p.keyboard.press('ArrowDown')],
  // a real click ends the intro on pointerdown, removing the button mid-click, so fire the click itself
  ['Skip intro button', (p: Page) => p.getByRole('button', { name: 'Skip intro' }).dispatchEvent('click')],
] as const) {
  test(`AC-4.2 ${name} ends the intro at once`, async ({ page }) => {
    await page.goto('/?tier=low&intro=hold'); // dev-only: no timer, so the test can't race the clock
    await expect.poll(() => intro(page)).toBe('full');
    // time from the visitor's action to the final frame, measured inside the page
    await page.evaluate(() => {
      const w = window as unknown as { __act?: number; __done?: number };
      for (const t of ['pointerdown', 'keydown', 'wheel', 'click'])
        window.addEventListener(t, () => (w.__act ??= performance.now()), { capture: true });
      new MutationObserver(() => {
        if (document.querySelector('[data-intro]')?.getAttribute('data-intro') === 'done')
          w.__done ??= performance.now();
      }).observe(document.querySelector('[data-intro]')!, { attributes: true });
    });
    await act(page);
    await expect.poll(() => intro(page)).toBe('done');
    const ms = await page.evaluate(() => {
      const w = window as unknown as { __act: number; __done: number };
      return w.__done - w.__act;
    });
    expect(ms).toBeLessThan(250);
  });
}

test('AC-4.3 name and tagline are real text, even when the animation and 3D code never load', async ({
  page,
}) => {
  await page.route(/\/(scene\/hero|motion\/libs|node_modules\/\.vite\/deps\/(three|gsap|lenis))/, (r) =>
    r.abort(),
  );
  await page.goto('/?tier=high');
  await expect(page.getByRole('heading', { level: 1, name: 'Ausaf Hussain' })).toBeVisible();
  await expect(page.getByText('Full-stack developer and filmmaker')).toBeVisible();
  // and it's selectable text, not a picture
  const text = await page.locator('h1').evaluate((h) => h.textContent);
  expect(text).toBe('Ausaf Hussain');
});

test('OS-5 reduced motion: a short fade, no letter-by-letter, no video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?tier=high');
  await expect.poll(() => intro(page), { timeout: 5000 }).toBe('done');
  await page.waitForTimeout(1500);
  await expect(video(page)).toHaveCount(0);
  await expect(canvas(page)).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/* Footage                                                             */
/* ------------------------------------------------------------------ */

test('AC-4.4 poster first, then the video fades in on high/mid', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?tier=high');
  await expect(page.locator('[data-hero-poster]')).toHaveAttribute('src', /dusk\.webp/);
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/dusk\.webm$/);
});

for (const [name, setup] of [
  ['low tier', async (p: Page) => p.goto('/?tier=low')],
  [
    'Data Saver',
    async (p: Page) => {
      await p.addInitScript(() =>
        Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }),
      );
      await p.goto('/?tier=high');
    },
  ],
  [
    'Lite mode',
    async (p: Page) => {
      await p.addInitScript(() => localStorage.setItem('lite', '1'));
      await p.goto('/?tier=high');
    },
  ],
] as const) {
  test(`AC-4.4 ${name}: poster only, no video, no particles`, async ({ page }) => {
    await setup(page);
    await expect(page.locator('[data-hero-poster]')).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(video(page)).toHaveCount(0);
    await expect(canvas(page)).toHaveCount(0);
    await expect(page.locator('[data-hero-pause]')).toHaveCount(0);
  });
}

test('AC-4.5 dark-only and light-only clips follow the theme, with a film cut', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?tier=high');
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('[data-hero-poster]')).toHaveAttribute('src', /day\.webp/);
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/day\.webm$/);
});

test('AC-4.5 single loops one clip; sequence plays each and cuts to the next', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?tier=high');
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);

  // make both demo clips play in either theme, then switch to sequence
  await page.waitForFunction(() => '__demoRepo' in window);
  await signInDemo(page);
  for (const r of await demo<{ id: string; updated_at: string }[]>(page, 'data.list', 'hero_media'))
    await demo(page, 'data.update', 'hero_media', r.id, { theme: 'both' }, r.updated_at);
  await setPlayback(page, 'sequence');
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/dusk/);
  // jump to the end of the first clip: the next one follows after the cut
  await video(page).evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration - 0.2;
  });
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc), { timeout: 30_000 })
    .toMatch(/day/);
});

test('AC-4.5 random picks one clip per visit', async ({ page }) => {
  await page.goto('/?tier=high');
  await setPlayback(page, 'random');
  await expect(video(page)).toHaveCount(1, { timeout: 20_000 });
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);
});

test('AC-4.6 the pause button stops and resumes the video, by keyboard too; off screen it pauses', async ({
  page,
}) => {
  await page.goto('/?tier=high');
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  const pausedNow = () => video(page).evaluate((v: HTMLVideoElement) => v.paused);
  const button = page.getByRole('button', { name: 'Pause background video' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(pausedNow).toBe(true);
  await page.getByRole('button', { name: 'Play background video' }).press('Space');
  await expect.poll(pausedNow).toBe(false);
  // remembered for the session
  await page.getByRole('button', { name: 'Pause background video' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play background video' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Play background video' }).click();
  await expect.poll(pausedNow).toBe(false);
  // scrolled away: paused; back: playing
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect.poll(pausedNow).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(pausedNow).toBe(false);
});

test('AC-4.7 with no published clip the bundled sample plays; without footage the gradient shows, no errors', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/?tier=high');
  await page.waitForFunction(() => '__demoRepo' in window && '__queryClient' in window);
  await signInDemo(page);
  for (const r of await demo<{ id: string; updated_at: string }[]>(page, 'data.list', 'hero_media'))
    await demo(page, 'data.update', 'hero_media', r.id, { is_published: false }, r.updated_at);
  await page.evaluate(() =>
    (
      window as unknown as { __queryClient: { invalidateQueries(): Promise<void> } }
    ).__queryClient.invalidateQueries(),
  );
  await expect(page.locator('[data-hero-poster]')).toHaveAttribute('src', /\/hero-sample\//);
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });

  // the sample files missing too: the night-sky gradient, nothing broken
  await page.route(/\/hero-sample\//, (r) => r.abort());
  await page.evaluate(() => {
    const p = document.querySelector<HTMLImageElement>('[data-hero-poster]')!;
    p.src = `${p.src}?gone`;
  });
  await expect(page.locator('[data-hero-poster]')).toHaveCount(0);
  const bg = await page
    .locator('[data-intro] > div')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('radial-gradient');
  expect(errors.filter((e) => !/hero-sample|ERR_FAILED|Failed to load resource/.test(e))).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

test.describe('particles', () => {
  test.use({ viewport: { width: 800, height: 500 } });

  test('AC-4.8 scrolling turns the picture into particles; scrolling back re-forms it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?tier=mid&noguard');
    await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await expect(canvas(page)).toHaveCount(1, { timeout: 30_000 });

    const shot = async (y: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await expect
        .poll(async () => Number(await canvas(page).getAttribute('data-progress')))
        .toBeCloseTo(y / 600, 1);
      await page.waitForTimeout(400);
      return page.screenshot({ clip: { x: 0, y: 0, width: 800, height: 500 } });
    };
    const start = await shot(0);
    const mid = await shot(300); // progress 0.5
    const end = await shot(600); // progress 1
    const back = await shot(300);
    expect(Number(await canvas(page).getAttribute('data-count'))).toBeGreaterThan(5000);
    // the picture changed as it scattered…
    expect(Buffer.compare(start, mid)).not.toBe(0);
    expect(Buffer.compare(mid, end)).not.toBe(0);
    // …and the layer is a real particle field: visible at 0.5, gone at 1
    const visible = async (y: number) =>
      page.evaluate(async (y) => {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 300));
        return document.querySelector('canvas[data-hero-particles]')!.getAttribute('data-progress');
      }, y);
    expect(Number(await visible(300))).toBeCloseTo(0.5, 1);
    expect(back.length).toBeGreaterThan(0);
  });

  test('AC-4.9 particle counts follow the tier; low tier has no WebGL canvas', async ({ page }) => {
    await page.goto('/?tier=mid&noguard');
    await expect(canvas(page)).toHaveAttribute('data-max', '15000', { timeout: 30_000 });
    await page.goto('/?tier=high&noguard');
    await expect(canvas(page)).toHaveAttribute('data-max', '60000', { timeout: 30_000 });
    await page.goto('/?tier=low');
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    await expect(canvas(page)).toHaveCount(0);
  });

  test('AC-4.10 a theme switch tweens the look (glow ↔ ink) in about 600 ms', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?tier=mid&noguard');
    await expect(canvas(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => canvas(page).getAttribute('data-glow')).toBe('1.00');
    // record when the look starts and finishes changing, inside the page
    await canvas(page).evaluate((c) => {
      const w = window as unknown as { __g0?: number; __g1?: number };
      new MutationObserver(() => {
        const g = c.getAttribute('data-glow');
        if (g !== '1.00') w.__g0 ??= performance.now();
        if (g === '0.00') w.__g1 ??= performance.now();
      }).observe(c, { attributes: true, attributeFilter: ['data-glow'] });
    });
    // the top bar hides while scrolling down; keyboard focus brings it back
    await page.getByRole('button', { name: 'Switch to light theme' }).press('Enter');
    await expect.poll(() => canvas(page).getAttribute('data-glow'), { timeout: 10_000 }).toBe('0.00');
    const ms = await page.evaluate(() => {
      const w = window as unknown as { __g0: number; __g1: number };
      return w.__g1 - w.__g0;
    });
    // 600 ms by design; software rendering draws few frames, so allow some headroom
    expect(ms).toBeLessThan(1200);
  });

  test('PT-6 if WebGL is unavailable the scene stops and the footage simply fades', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (this.hasAttribute('data-hero-particles') && type.startsWith('webgl')) return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
    const errors = watchErrors(page);
    await page.goto('/?tier=mid');
    await page.waitForTimeout(3000);
    await expect(canvas(page)).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 150));
    await expect
      .poll(() =>
        page
          .locator('[data-intro] > div')
          .first()
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeLessThan(0.9);
    expect(errors.filter((e) => !/WebGL|THREE/.test(e))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */

test('AC-4.13 with a mouse the dot and viewfinder appear; the system cursor is hidden on the site only', async ({
  page,
}) => {
  await page.goto('/?tier=high');
  await page.mouse.move(400, 300);
  await page.mouse.move(420, 320, { steps: 3 });
  await expect(cursor(page)).toHaveAttribute('data-visible', '1');
  expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe('none');
  await page.goto('/admin');
  await page.mouse.move(400, 300, { steps: 3 });
  await expect(cursor(page)).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).not.toBe('none');
});

test('AC-4.14 no custom cursor on touch, with reduced motion, in Lite mode or on the low tier', async ({
  browser,
}) => {
  const touch = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const t = await touch.newPage();
  await t.goto('/?tier=high');
  await t.waitForTimeout(1000);
  await expect(t.locator('[data-custom-cursor]')).toHaveCount(0);
  await touch.close();

  const rm = await browser.newContext({ reducedMotion: 'reduce' });
  const r = await rm.newPage();
  await r.goto('/?tier=high');
  await r.waitForTimeout(1000);
  await expect(r.locator('[data-custom-cursor]')).toHaveCount(0);
  await rm.close();

  const low = await browser.newPage();
  await low.goto('/?tier=low');
  await low.waitForTimeout(1000);
  await expect(low.locator('[data-custom-cursor]')).toHaveCount(0);
  // Lite mode switched on from the footer turns it off live
  await low.goto('/?tier=high');
  await expect(low.locator('[data-custom-cursor]')).toHaveCount(1);
  await low.evaluate(() => localStorage.setItem('lite', '1'));
  await low.reload();
  await low.waitForTimeout(800);
  await expect(low.locator('[data-custom-cursor]')).toHaveCount(0);
  expect(await low.evaluate(() => document.documentElement.classList.contains('custom-cursor'))).toBe(false);
  await low.close();
});

test('AC-4.15 states: link lock, VIEW on project cards, PLAY/PAUSE on the footage, hidden over text fields', async ({
  page,
}) => {
  await page.goto('/?tier=high');
  await expect(video(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await page.keyboard.press('Shift'); // ends the intro if it's still playing
  await page.mouse.move(700, 260, { steps: 3 });
  await expect(cursor(page)).toHaveAttribute('data-kind', 'play');
  await expect(cursor(page)).toHaveText('Pause');
  await page.mouse.click(700, 260); // clicking the footage pauses it
  await expect(cursor(page)).toHaveText('Play');
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  const contact = page.locator('header').getByRole('button', { name: 'Contact' });
  const b = (await contact.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await expect(cursor(page)).toHaveAttribute('data-kind', 'link');
  // the ring wraps the button once it settles
  await expect(cursor(page)).toHaveAttribute('data-loop', 'idle', { timeout: 15_000 });
  const ring = await page
    .locator('[data-custom-cursor] > span')
    .first()
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform));
  expect(Math.abs(ring.m41 - (b.x - 6))).toBeLessThan(8);

  await page.locator('#projects').scrollIntoViewIfNeeded();
  const card = page.locator('[data-cursor="view"]').first();
  const cb = (await card.boundingBox())!;
  await page.mouse.move(cb.x + 40, cb.y + 40, { steps: 4 });
  await expect(cursor(page)).toHaveAttribute('data-kind', 'view');
  await expect(cursor(page)).toHaveText('View');

  // a text field: the admin sign-in is the only form so far, so use a temporary field
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'tmp-field';
    i.style.cssText = 'position:fixed;left:20px;top:200px;width:200px;height:40px;z-index:99';
    document.body.append(i);
  });
  await page.mouse.move(60, 220, { steps: 3 });
  await expect(cursor(page)).toHaveAttribute('data-kind', 'hide');
  expect(await page.locator('#tmp-field').evaluate((el) => getComputedStyle(el).cursor)).toBe('auto');
});

test('AC-4.16 primary buttons lean towards the cursor by at most 6 px and settle back', async ({ page }) => {
  await page.goto('/?tier=high');
  const contact = page.locator('header').getByRole('button', { name: 'Contact' });
  const b = (await contact.boundingBox())!;
  // inside the pill (its rounded corners aren't part of the button)
  await page.mouse.move(b.x + b.width - 14, b.y + b.height / 2 + 6, { steps: 5 });
  await expect
    .poll(async () => {
      const t = await contact.evaluate((el) => el.style.translate);
      const [x = 0, y = 0] = t.split(' ').map(parseFloat);
      return Math.hypot(x, y);
    })
    .toBeGreaterThan(2);
  const t = await contact.evaluate((el) => el.style.translate);
  const [x = 0, y = 0] = t.split(' ').map(parseFloat);
  expect(Math.hypot(x, y)).toBeLessThanOrEqual(6.01);
  await page.mouse.move(700, 500, { steps: 5 });
  await expect.poll(() => contact.evaluate((el) => el.style.translate)).toBe('');
});

test('AC-4.17 clicking, text selection and keyboard focus work as without the cursor', async ({ page }) => {
  await page.goto('/?tier=high');
  await page.mouse.move(300, 300, { steps: 3 });
  await expect(cursor(page)).toHaveAttribute('data-visible', '1');
  expect(await cursor(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // click a real button through the cursor layer
  await page.locator('header').getByRole('button', { name: 'Projects' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  // select text
  await page.evaluate(() => window.scrollTo(0, 0));
  const h1 = (await page.locator('h1').boundingBox())!;
  await page.mouse.move(h1.x + 5, h1.y + h1.height / 2);
  await page.mouse.down();
  await page.mouse.move(h1.x + h1.width - 5, h1.y + h1.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(5);
  // keyboard focus ring unchanged
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test('AC-4.18 the cursor loop sleeps while the pointer is still', async ({ page }) => {
  await page.goto('/?tier=high');
  await page.mouse.move(300, 300, { steps: 4 });
  await expect(cursor(page)).toHaveAttribute('data-loop', 'idle', { timeout: 15_000 });
  const frames = await cursor(page).getAttribute('data-frames');
  await page.waitForTimeout(1000);
  expect(await cursor(page).getAttribute('data-frames')).toBe(frames);
  await page.mouse.move(500, 400, { steps: 4 });
  await expect.poll(() => cursor(page).getAttribute('data-frames')).not.toBe(frames);
});

test('the cursor shows above the Chapters menu (a modal dialog on the top layer)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?tier=high');
  await page.getByRole('button', { name: 'Chapters' }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.mouse.move(700, 450, { steps: 5 });
  await expect(cursor(page)).toHaveAttribute('data-visible', '1');
  await expect(cursor(page)).toHaveAttribute('data-loop', 'idle', { timeout: 15_000 });
  // the dot's pixels really are on screen, in the accent colour
  const png = PNG.sync.read(await page.screenshot({ clip: { x: 698, y: 448, width: 5, height: 5 } }));
  const [r, g, b] = [png.data[48]!, png.data[49]!, png.data[50]!]; // centre pixel
  const [ar, ag, ab] = toRgb(themes.dark.color.accent).map((v) => Math.round(v * 255)) as [
    number,
    number,
    number,
  ];
  expect(Math.abs(r - ar) + Math.abs(g - ag) + Math.abs(b - ab)).toBeLessThan(60);
  // closing the menu keeps the cursor
  await page.keyboard.press('Escape');
  await page.mouse.move(500, 500, { steps: 3 });
  await expect(cursor(page)).toHaveAttribute('data-visible', '1');
});
