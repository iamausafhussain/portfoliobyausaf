/**
 * Part 5 — The System: globe and projects (spec 05 §5), against the demo site.
 * WebGL runs in software here, so 3D tests use the mid tier, a smaller window and the
 * development-only `?noguard` switch (the frame guard would rightly stop a software renderer).
 */
import { expect, test, type Page } from '@playwright/test';
import { demo, expectToast, go, rows, signIn, watchErrors } from './helpers';

test.describe.configure({ retries: 2, timeout: 120_000 });
test.use({ viewport: { width: 1100, height: 700 } });

const stage = (page: Page) => page.locator('canvas[data-stage]');
const ds = (page: Page) =>
  page.evaluate(() => ({
    ...(document.querySelector<HTMLCanvasElement>('canvas[data-stage]')?.dataset ?? {}),
  }));
const activeCard = (page: Page) => page.locator('[data-stop][data-active] article');

interface PublicProject {
  id: string;
  slug: string;
  title: string;
  is_featured: boolean;
}
/** Published projects in display order, read the way the public site reads them (no sign-in). */
async function published(page: Page): Promise<PublicProject[]> {
  await page.waitForFunction(() => '__demoRepo' in window);
  return page.evaluate(async () => {
    const repo = (
      window as unknown as { __demoRepo: { publicSource: { published(t: string): Promise<unknown[]> } } }
    ).__demoRepo;
    return (await repo.publicSource.published('projects')) as PublicProject[];
  });
}

/** Skip the intro and open the home page with 3D on. */
async function open(page: Page, query = '?tier=mid&noguard', theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((t) => {
    sessionStorage.setItem('intro-played', '1');
    localStorage.setItem('theme', t);
  }, theme);
  await page.goto(`/${query}`);
}

/** Scroll so the tour stop of a project is showing (uses its anchor). */
async function toStop(page: Page, slug: string) {
  await page.locator(`#project-${slug}`).waitFor({ state: 'attached' });
  await page.evaluate((id) => {
    const el = document.getElementById(id)!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72);
  }, `project-${slug}`);
}

/** Waits until the globe has formed and stopped turning. */
async function settled(page: Page) {
  await expect.poll(async () => (await ds(page)).globeForm, { timeout: 30_000 }).toBe('1.00');
  let last = '';
  await expect
    .poll(
      async () => {
        const d = await ds(page);
        const now = `${d.globeRotX}|${d.globeRotY}`;
        const same = now === last;
        last = now;
        return same;
      },
      { timeout: 30_000, intervals: [400] },
    )
    .toBe(true);
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

test('AC-5.1 one WebGL canvas for the whole page, shared by the hero and the globe', async ({ page }) => {
  await open(page);
  await expect(stage(page)).toHaveCount(1, { timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(async () => (await ds(page)).heroParticles).toBe('');
  await toStop(page, 'supply-chain-edi-pipeline');
  await expect.poll(async () => (await ds(page)).globe, { timeout: 30_000 }).toBe('');
  expect(await page.locator('canvas').count()).toBe(1);
});

test('AC-5.2 the stage stops drawing when nothing moves and when the tab is hidden', async ({ page }) => {
  await open(page);
  await expect(stage(page)).toHaveCount(1, { timeout: 30_000 });
  // the footer: no hero cloud (the globe has formed above) and no globe on screen
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  const a = (await ds(page)).frames;
  await page.waitForTimeout(1500);
  expect((await ds(page)).frames).toBe(a);

  // on the globe it animates; hiding the tab stops it
  await toStop(page, 'supply-chain-edi-pipeline');
  await expect.poll(async () => (await ds(page)).globeForm, { timeout: 30_000 }).toBe('1.00');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  const b = (await ds(page)).frames;
  await page.waitForTimeout(1500);
  expect((await ds(page)).frames).toBe(b);
});

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */

test('AC-5.4 continents of dots, home, and a node per published project', async ({ page }) => {
  await open(page);
  await toStop(page, 'supply-chain-edi-pipeline');
  await settled(page);
  const d = await ds(page);
  const count = (await published(page)).length;
  expect(Number(d.globeDots)).toBeGreaterThan(3500);
  expect(Number(d.globeNodes)).toBe(count + 1); // + home
  expect(Number(d.globeRoutes)).toBe(count); // home ↔ each project
});

test('AC-5.6 / AC-5.7 the globe forms from the particles as the chapter scrolls in, and reverses', async ({
  page,
}) => {
  await open(page);
  await expect(stage(page)).toHaveCount(1, { timeout: 30_000 });
  const vh = 700;
  // puts the chapter's content block at `viewTop` px from the top of the window (the page
  // above may still be settling, so measure each time)
  const formAt = async (viewTop: number) => {
    await page.locator('[data-mode]').waitFor();
    for (let k = 0; k < 3; k++)
      await page.evaluate((t) => {
        const el = document.querySelector('[data-mode]')!;
        window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - t);
      }, viewTop);
    await page.waitForTimeout(800);
    return Number((await ds(page)).globeForm ?? 0);
  };
  expect(await formAt(vh + 50)).toBe(0);
  const half = await formAt(vh * 0.55);
  expect(half).toBeGreaterThan(0.2);
  expect(half).toBeLessThan(0.9);
  expect(await formAt(0)).toBe(1);
  expect(await formAt(vh + 50)).toBe(0); // scrolling back reverses it
});

test('AC-5.6 theme switch tweens the globe from glow to ink in about 600 ms', async ({ page }) => {
  await open(page);
  await toStop(page, 'supply-chain-edi-pipeline');
  await settled(page);
  await stage(page).evaluate((c) => {
    const w = window as unknown as { __g0?: number; __g1?: number };
    new MutationObserver(() => {
      const g = c.getAttribute('data-glow');
      if (g !== '1.00') w.__g0 ??= performance.now();
      if (g === '0.00') w.__g1 ??= performance.now();
    }).observe(c, { attributes: true, attributeFilter: ['data-glow'] });
  });
  await page.getByRole('button', { name: 'Switch to light theme' }).press('Enter');
  await expect.poll(async () => (await ds(page)).glow, { timeout: 10_000 }).toBe('0.00');
  const ms = await page.evaluate(() => {
    const w = window as unknown as { __g0: number; __g1: number };
    return w.__g1 - w.__g0;
  });
  expect(ms).toBeLessThan(1200); // 600 ms by design; software rendering draws few frames
});

/* ------------------------------------------------------------------ */
/* Chapter                                                             */
/* ------------------------------------------------------------------ */

test('AC-5.8 one tour stop per featured project; the right node faces the camera and the right card shows', async ({
  page,
}) => {
  await open(page);
  const featured = (await published(page)).filter((p) => p.is_featured);
  await expect(page.locator('[data-tour] [data-stop]')).toHaveCount(Math.min(6, featured.length));
  for (const p of featured) {
    await toStop(page, p.slug as string);
    await expect(activeCard(page)).toHaveAttribute('data-project', p.slug as string);
    await expect.poll(async () => (await ds(page)).globeFocus, { timeout: 30_000 }).toBe(p.id);
    await settled(page);
    // facing the camera: the node is at the centre of the globe's slot
    const [x, y] = ((await ds(page)).globeFocusXy ?? '').split(',').map(Number);
    const slot = (await page.locator('[data-globe-slot]').boundingBox())!;
    expect(Math.abs(x! - (slot.x + slot.width / 2))).toBeLessThan(slot.width * 0.06);
    expect(Math.abs(y! - (slot.y + slot.height / 2))).toBeLessThan(slot.height * 0.06);
  }
});

test('AC-5.9 hover a node: label and card highlight; click opens it; hover a card: its node lights', async ({
  page,
}) => {
  await open(page);
  await toStop(page, 'supply-chain-edi-pipeline');
  await settled(page);
  const [x, y] = ((await ds(page)).globeFocusXy ?? '').split(',').map(Number) as [number, number];
  await page.mouse.move(x - 60, y - 60);
  await page.mouse.move(x, y, { steps: 4 });
  await expect(page.locator('[data-node-label]')).toHaveAttribute('data-show', '1');
  await expect(page.locator('[data-node-label]')).toHaveText('Supply-chain EDI pipeline');
  await expect(activeCard(page)).toHaveAttribute('data-highlighted', 'true');
  await expect(page.locator('[data-custom-cursor]')).toHaveText('Open');

  // a card lights its node
  await page.mouse.move(10, 600);
  const grid = page.locator('#all-projects ~ ul article[data-project="drone-reel-2026"]');
  await grid.scrollIntoViewIfNeeded();
  await grid.hover();
  const drone = (await published(page)).find((p) => p.slug === 'drone-reel-2026')!;
  await expect.poll(async () => (await ds(page)).globeHover).toBe(drone.id);

  // click a node
  await toStop(page, 'supply-chain-edi-pipeline');
  await settled(page);
  const [x2, y2] = ((await ds(page)).globeFocusXy ?? '').split(',').map(Number) as [number, number];
  await page.mouse.move(x2, y2, { steps: 3 });
  await page.mouse.click(x2, y2);
  await expect(page).toHaveURL(/\/projects\/supply-chain-edi-pipeline$/);
});

test('AC-5.10 dragging turns the globe with inertia (cursor shows DRAG); touch scrolls the page', async ({
  page,
}) => {
  await open(page);
  await toStop(page, 'supply-chain-edi-pipeline');
  await settled(page);
  const slot = (await page.locator('[data-globe-slot]').boundingBox())!;
  await page.mouse.move(slot.x + 60, slot.y + 40);
  await page.mouse.move(slot.x + 70, slot.y + 40, { steps: 2 });
  await expect(page.locator('[data-custom-cursor]')).toHaveAttribute('data-kind', 'drag');
  const before = Number((await ds(page)).globeRotY);
  await page.mouse.down();
  await page.mouse.move(slot.x + 260, slot.y + 40, { steps: 8 });
  await page.mouse.up();
  const after = Number((await ds(page)).globeRotY);
  expect(after - before).toBeGreaterThan(0.5);
  await page.waitForTimeout(300);
  expect(Number((await ds(page)).globeRotY)).toBeGreaterThan(after); // still coasting
  // touch: the slot lets vertical scrolling through
  expect(await page.locator('[data-globe-slot]').evaluate((el) => getComputedStyle(el).touchAction)).toBe(
    'pan-y',
  );
});

test('AC-5.11 tabbing through the tour cards turns the globe to each; every card is a link', async ({
  page,
}) => {
  await open(page);
  const featured = (await published(page)).filter((p) => p.is_featured);
  await page.locator('[data-tour]').waitFor();
  const links = page.locator('[data-tour] [data-stop] a');
  await expect(links).toHaveCount(featured.length);
  for (let i = 0; i < featured.length; i++) {
    await links.nth(i).focus();
    await expect(page.locator(`[data-stop="${i}"]`)).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    });
    await expect.poll(async () => (await ds(page)).globeFocus, { timeout: 30_000 }).toBe(featured[i]!.id);
    expect(await links.nth(i).getAttribute('href')).toBe(`/projects/${featured[i]!.slug}`);
  }
});

for (const [name, setup] of [
  ['low tier', (p: Page) => open(p, '?tier=low')],
  [
    'Lite mode',
    async (p: Page) => {
      await p.addInitScript(() => localStorage.setItem('lite', '1'));
      await open(p, '?tier=high');
    },
  ],
  [
    'reduced motion',
    async (p: Page) => {
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await open(p, '?tier=high');
    },
  ],
  [
    'no WebGL',
    async (p: Page) => {
      await p.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          if (type.startsWith('webgl')) return null;
          return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof orig;
      });
      await open(p, '?tier=high');
    },
  ],
] as const) {
  test(`AC-5.12 ${name}: no canvas, the still globe and the same cards, no pinning`, async ({ page }) => {
    const errors = watchErrors(page);
    await setup(page);
    await page.locator('#projects').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-globe-still]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    await expect(stage(page)).toHaveCount(0);
    await expect(page.locator('[data-tour]')).toHaveCount(0);
    await expect(page.locator('#all-projects ~ ul article')).toHaveCount((await published(page)).length);
    expect(errors.filter((e) => !/WebGL|THREE|3D stage/.test(e))).toEqual([]);
  });
}

/* ------------------------------------------------------------------ */
/* Project page                                                        */
/* ------------------------------------------------------------------ */

test('AC-5.14 project page: title card, cover, story, tech, gallery, prev/next, back to its stop', async ({
  page,
}) => {
  await open(page, '?tier=low');
  await page.goto('/projects/supply-chain-edi-pipeline');
  await expect(page.getByRole('heading', { level: 1, name: 'Supply-chain EDI pipeline' })).toBeVisible();
  await expect(page.getByText('Backend developer')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Diagram of the EDI pipeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The problem' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tech' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open image 1/ })).toBeVisible();

  // prev / next follow display order (wrapping round)
  const list = await published(page);
  const i = list.findIndex((p) => p.slug === 'supply-chain-edi-pipeline');
  const next = list[(i + 1) % list.length]!;
  const prev = list[(i - 1 + list.length) % list.length]!;
  await expect(page.getByRole('link', { name: new RegExp(`Next.*${next.title}`) })).toHaveAttribute(
    'href',
    `/projects/${next.slug}`,
  );
  await expect(page.getByRole('link', { name: new RegExp(`Previous.*${prev.title}`) })).toHaveAttribute(
    'href',
    `/projects/${prev.slug}`,
  );

  // back to The System lands on this project
  await page.getByRole('button', { name: '← Back to The System' }).click();
  await expect(page).toHaveURL(/\/#project-supply-chain-edi-pipeline$/);
  await expect(
    page.locator('#all-projects ~ ul article[data-project="supply-chain-edi-pipeline"]'),
  ).toBeInViewport({
    timeout: 10_000,
  });
});

test('AC-5.14 back from a featured project lands on its tour stop', async ({ page }) => {
  await open(page);
  await page.goto('/projects/drone-reel-2026?tier=mid&noguard');
  await page.getByRole('button', { name: '← Back to The System' }).click();
  await expect(activeCard(page)).toHaveAttribute('data-project', 'drone-reel-2026', { timeout: 15_000 });
});

test('AC-5.15 gallery viewer: mouse, arrows, swipe, Esc; focus trapped and returned', async ({ page }) => {
  await open(page, '?tier=low');
  await page.goto('/projects/supply-chain-edi-pipeline');
  const thumb = page.getByRole('button', { name: /Open image 1/ });
  await thumb.click();
  const viewer = page.locator('dialog[open]');
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('1 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('2 / 3');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toContainText('3 / 3');
  await viewer.getByRole('button', { name: 'Next image' }).click();
  await expect(viewer).toContainText('1 / 3');
  // swipe left = next
  await viewer.locator('figure').evaluate((fig) => {
    const opts = { bubbles: true, pointerType: 'touch', pointerId: 7, isPrimary: true } as PointerEventInit;
    fig.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 600, clientY: 300 }));
    fig.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 450, clientY: 300 }));
  });
  await expect(viewer).toContainText('2 / 3');
  // the page behind is inert: Tab stays in the viewer (or goes to the browser's own UI),
  // never to the page content behind it
  for (let k = 0; k < 6; k++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => {
        const a = document.activeElement;
        return !a || a === document.body || !!a.closest('dialog[open]');
      }),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(thumb).toBeFocused();
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

test('AC-5.16 admin: place a project by map, by city, by lat/lng, or back to automatic', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  const edi = (await rows(page, 'projects')).find((p) => p.slug === 'supply-chain-edi-pipeline')!;
  await page.getByRole('link', { name: 'Supply-chain EDI pipeline' }).first().click();
  await page.waitForURL(new RegExp(`/admin/projects/${edi.id}$`));
  await page.getByText('Place automatically').click();
  // click the map at New York (40.7, −74)
  const map = page.locator('[data-globe-map]');
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: ((-74 + 180) / 360) * box.width, y: ((90 - 40.7) / 180) * box.height } });
  // one map pixel is about half a degree
  await expect
    .poll(async () => Math.abs(Number(await page.getByLabel(/Latitude/).inputValue()) - 40.7))
    .toBeLessThan(1);
  expect(Math.abs(Number(await page.getByLabel(/Longitude/).inputValue()) + 74)).toBeLessThan(1);
  // a city
  await page.getByLabel('Find a city').fill('Pokhara, NP');
  await expect(page.getByLabel(/Latitude/)).toHaveValue('28.27');
  await expect(page.getByLabel(/Longitude/)).toHaveValue('83.97');
  // exact numbers
  await page.getByLabel(/Longitude/).fill('84.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  expect((await demo<{ globe: unknown }>(page, 'data.get', 'projects', edi.id)).globe).toEqual({
    lat: 28.27,
    lng: 84.5,
  });
  // back to automatic
  await page.getByText('Place automatically').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  expect((await demo<{ globe: unknown }>(page, 'data.get', 'projects', edi.id)).globe).toBeNull();
});
