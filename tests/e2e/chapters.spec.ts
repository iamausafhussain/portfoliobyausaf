/**
 * Part 6 — the content chapters (spec 06 §5), against the demo site: reveals, About,
 * Credits, Timeline, Reviews and custom sections. The low tier keeps the 3D stage out of
 * the way; the data is read the way the public site reads it (no sign-in).
 */
import { expect, test, type Page } from '@playwright/test';
import { demo, DEMO, watchErrors } from './helpers';

test.describe.configure({ retries: 2 });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown> & { id: string };

async function open(page: Page, path = '/', init: { lite?: boolean; noObserver?: boolean } = {}) {
  await page.addInitScript((o) => {
    sessionStorage.setItem('intro-played', '1');
    if (o.lite) localStorage.setItem('lite', '1');
    if (o.noObserver) delete (window as unknown as Record<string, unknown>).IntersectionObserver;
  }, init);
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}tier=low`);
  await page.waitForFunction(() => '__demoRepo' in window);
}

/** Published rows, in display order, as the public site sees them. */
const published = (page: Page, table: string) =>
  page.evaluate(
    (t) =>
      (
        window as unknown as { __demoRepo: { publicSource: { published(t: string): Promise<Row[]> } } }
      ).__demoRepo.publicSource.published(t),
    table,
  );
const settings = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __demoRepo: { publicSource: { settings(): Promise<Row> } } }
    ).__demoRepo.publicSource.settings(),
  );

/** Signs in to the demo backend so the test can change data, then refreshes the page's queries. */
async function signInDemo(page: Page) {
  await demo(page, 'auth.signIn', DEMO.email, 'any-password');
  const setup = await demo<{ factorId: string }>(page, 'auth.startTotpSetup');
  await demo(page, 'auth.finishTotpSetup', setup.factorId, DEMO.code);
}
const refresh = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __queryClient: { invalidateQueries(): Promise<void> } }
    ).__queryClient.invalidateQueries(),
  );

/** Scrolls an element to a point in the window without smooth scrolling. */
async function scrollTo(page: Page, selector: string, offset = 80) {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate(
    ({ selector, offset }) => {
      const el = document.querySelector(selector)!;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
    },
    { selector, offset },
  );
}

const revealed = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => 'revealed' in (el as HTMLElement).dataset);

/* ------------------------------------------------------------------ */
/* Reveals (CH-1 – CH-5)                                               */
/* ------------------------------------------------------------------ */

test('AC-6.1 chapter heads play their title-card reveal once, as they scroll in', async ({ page }) => {
  await open(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('reveals-on')))
    .toBe(true);
  const head = '#timeline header[data-reveal="title"]';
  expect(await revealed(page, head)).toBe(false);
  const opacityBefore = await page.locator(`${head} h2`).evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacityBefore)).toBeLessThan(0.1);

  await scrollTo(page, '#timeline', 100);
  await expect.poll(() => revealed(page, head)).toBe(true);
  await expect
    .poll(() => page.locator(`${head} h2`).evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);

  // scrolled away and back: it stays revealed (once per page view)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  expect(await revealed(page, head)).toBe(true);
  await scrollTo(page, '#timeline', 100);
  expect(Number(await page.locator(`${head} h2`).evaluate((el) => getComputedStyle(el).opacity))).toBe(1);

  // every chapter head on the page reveals when reached
  const heads = await page.locator('main header[data-reveal="title"]').count();
  for (let i = 0; i < heads; i++) {
    await page
      .locator('main header[data-reveal="title"]')
      .nth(i)
      .evaluate((el) => el.scrollIntoView());
    await expect
      .poll(() => page.locator('main header[data-reveal="title"]').nth(i).getAttribute('data-revealed'))
      .toBe('');
  }
});

test('AC-6.1 reduced motion: reveals are a short fade with no movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('reveals-on')))
    .toBe(true);
  const style = await page
    .locator('#credits [data-reveal="up"]:not([data-revealed])')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { transform: s.transform, durations: s.transitionDuration, delays: s.transitionDelay };
    });
  expect(style.transform).toBe('none');
  for (const d of style.durations.split(',')) expect(parseFloat(d)).toBeLessThanOrEqual(0.2);
  for (const d of style.delays.split(',')) expect(parseFloat(d)).toBe(0);
  const title = await page
    .locator('#credits header[data-reveal="title"] h2')
    .evaluate((el) => getComputedStyle(el).transform);
  expect(title).toBe('none');
});

test('AC-6.1 Lite mode: no reveals at all, content is simply there', async ({ page }) => {
  await open(page, '/', { lite: true });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.documentElement.classList.contains('reveals-on'))).toBe(false);
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
        (el) => Number(getComputedStyle(el).opacity) < 1,
      ).length,
  );
  expect(hidden).toBe(0);
  await expect(page.locator('#credits').getByText('Demo certification')).toBeVisible();
});

test('AC-6.2 without IntersectionObserver every chapter is visible', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/', { noObserver: true });
  await expect(page.locator('#credits').getByText('Demo certification')).toBeAttached();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.classList.contains('reveals-on'))).toBe(false);
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
        (el) => Number(getComputedStyle(el).opacity) < 1,
      ).length,
  );
  expect(hidden).toBe(0);
  // the readouts show their final numbers straight away
  const roles = await page.locator('[data-readout="roles"] span span').first().textContent();
  expect(Number(roles)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('AC-6.3 no "Placeholder" text anywhere on the public site', async ({ page }) => {
  for (const path of ['/', '/s/frames', '/s/talks', '/projects/supply-chain-edi-pipeline', '/resume']) {
    await open(page, path);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText(), path).not.toMatch(/placeholder/i);
  }
});

/* ------------------------------------------------------------------ */
/* About (AB-1 – AB-4)                                                 */
/* ------------------------------------------------------------------ */

test('AC-6.4 About shows the admin data, and nothing empty', async ({ page }) => {
  await open(page);
  const s = await settings(page);
  const about = page.locator('#about');
  await scrollTo(page, '#about');

  // portrait in its film frame (initials when there's none)
  await expect(about.getByText('ROLL 01 · FRAME 01')).toBeAttached();
  if (s.portrait)
    await expect(about.locator('figure img')).toHaveAttribute('alt', String((s.portrait as Row).alt));
  // short bio, one line per sentence, and the long bio as markdown
  await expect(about.locator('p').filter({ hasText: String(s.bio_short) })).toBeVisible();
  await expect(about.locator('strong', { hasText: 'Markdown' })).toBeVisible();
  // facts
  await expect(about.getByText(String(s.location))).toBeVisible();
  await expect(about.getByText('Available for work')).toBeVisible();
  // socials
  const socials = Object.entries((s.socials ?? {}) as Record<string, string | null>).filter(([, v]) => v);
  await expect(about.getByRole('list', { name: 'Elsewhere' }).getByRole('link')).toHaveCount(socials.length);
  // résumé only when there is one
  await expect(about.getByRole('link', { name: /Download résumé/ })).toHaveCount(s.resume_path ? 1 : 0);

  // with no portrait and no availability, the initials show and the badge goes
  await signInDemo(page);
  const current = await demo<{ updated_at: string }>(page, 'data.getSettings');
  await demo(
    page,
    'data.updateSettings',
    { portrait: null, available_for_work: false, bio_long: '' },
    current.updated_at,
  );
  await refresh(page);
  await expect(about.getByText('AH', { exact: true })).toBeVisible();
  await expect(about.getByText('Available for work')).toHaveCount(0);
  await expect(about.locator('strong', { hasText: 'Markdown' })).toHaveCount(0);
});

test('AC-6.5 readouts match the published data and zeros are hidden', async ({ page }) => {
  await open(page);
  const [experience, projects, achievements] = await Promise.all([
    published(page, 'experience'),
    published(page, 'projects'),
    published(page, 'achievements'),
  ]);
  const earliest = experience.map((e) => String(e.start_date)).sort()[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const months =
    (Number(today.slice(0, 4)) - Number(earliest.slice(0, 4))) * 12 +
    (Number(today.slice(5, 7)) - Number(earliest.slice(5, 7)));
  const expected: Record<string, string> = {
    years: `${Math.floor(months / 12)}${months % 12 ? '+' : ''}`,
    roles: String(experience.length),
    projects: String(projects.length),
    certifications: String(achievements.filter((a) => a.kind === 'certification').length),
    awards: String(achievements.filter((a) => a.kind === 'award' || a.kind === 'recognition').length),
  };
  await scrollTo(page, '#about [aria-label="In numbers"]', 300);
  for (const [key, value] of Object.entries(expected)) {
    await expect(page.locator(`[data-readout="${key}"] > span`).first()).toHaveText(value, { timeout: 5000 });
  }

  // a count that drops to zero disappears
  await signInDemo(page);
  for (const a of await demo<Row[]>(page, 'data.list', 'achievements')) {
    if (a.kind === 'certification')
      await demo(page, 'data.update', 'achievements', a.id, { is_published: false });
  }
  await refresh(page);
  await expect(page.locator('[data-readout="certifications"]')).toHaveCount(0);
  await expect(page.locator('[data-readout="roles"]')).toHaveCount(1);
});

/* ------------------------------------------------------------------ */
/* Credits (CR-1 – CR-3)                                               */
/* ------------------------------------------------------------------ */

test('AC-6.6 starring first, then credit lines grouped by kind; empty kinds absent', async ({ page }) => {
  await open(page);
  const list = await published(page, 'achievements');
  const credits = page.locator('#credits');
  await scrollTo(page, '#credits');

  const starring = list.filter((a) => a.is_highlighted);
  await expect(credits.locator('section[aria-labelledby="credits-starring"] li')).toHaveCount(
    starring.length,
  );
  for (const a of starring) {
    await expect(credits.locator('section[aria-labelledby="credits-starring"]')).toContainText(
      String(a.title),
    );
  }

  const order = ['award', 'certification', 'title', 'recognition', 'publication', 'other'];
  const kinds = order.filter((k) => list.some((a) => a.kind === k && !a.is_highlighted));
  const shown = await credits
    .locator('section[aria-labelledby^="credits-"]:not([aria-labelledby="credits-starring"])')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')!.replace('credits-', '')));
  expect(shown).toEqual(kinds);
  for (const a of list.filter((x) => !x.is_highlighted)) {
    const line = credits
      .locator(`#credits-${a.kind}`)
      .locator('..')
      .locator('li', { hasText: String(a.title) });
    await expect(line).toHaveCount(1);
    if (a.issuer) await expect(line).toContainText(String(a.issuer));
    if (a.awarded_on) await expect(line).toContainText(String(a.awarded_on).slice(0, 4));
    if (a.link) await expect(line.getByRole('link')).toHaveAttribute('href', String(a.link));
  }
});

/* ------------------------------------------------------------------ */
/* Timeline (TL-1 – TL-6)                                              */
/* ------------------------------------------------------------------ */

test('AC-6.7 clips sit on non-overlapping tracks and a click scrolls to the role', async ({ page }) => {
  await open(page);
  const roles = await published(page, 'experience');
  await scrollTo(page, '#timeline');
  const panel = page.locator('[data-edit-timeline]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-clip]')).toHaveCount(roles.length);

  // the ruler starts at or before the earliest start year and ends at this year
  const years = await panel.locator('[class*="tick"]').allTextContents();
  const earliest = Math.min(...roles.map((r) => Number(String(r.start_date).slice(0, 4))));
  expect(Number(years[0])).toBeLessThanOrEqual(earliest);
  expect(Number(years.at(-1))).toBe(new Date().getFullYear());

  // no two clips on the same track overlap; overlapping roles are on different tracks
  const clips = await panel.locator('[data-clip]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-clip')!, left: r.left, right: r.right, top: Math.round(r.top) };
    }),
  );
  for (const a of clips)
    for (const b of clips)
      if (a !== b && a.top === b.top) expect(a.right <= b.left + 1 || b.right <= a.left + 1).toBe(true);
  expect(new Set(clips.map((c) => c.top)).size).toBe(2);
  // longer roles make longer clips
  const width = Object.fromEntries(clips.map((c) => [c.id, c.right - c.left]));
  const intern = roles.find((r) => r.employment_type === 'internship')!;
  const job = roles.find((r) => r.end_date === null)!;
  expect(width[job.id]!).toBeGreaterThan(width[intern.id]! * 4);

  // click a clip → its details come into view below the panel
  await panel.locator(`[data-clip="${intern.id}"]`).click();
  await expect
    .poll(async () => {
      const top = await page.locator(`#role-${intern.id}`).evaluate((el) => el.getBoundingClientRect().top);
      const panelBottom = await panel.evaluate((el) => el.getBoundingClientRect().bottom);
      return top >= panelBottom - 2 && top < 900;
    })
    .toBe(true);
});

test('AC-6.8 the playhead follows the role details and lights the matching clip', async ({ page }) => {
  await open(page);
  const roles = (await published(page, 'experience')).sort((a, b) =>
    String(b.start_date).localeCompare(String(a.start_date)),
  );
  const panel = page.locator('[data-edit-timeline]');
  await expect(panel).toHaveAttribute('data-playhead', 'true');
  const ph = () => panel.evaluate((el) => parseFloat(el.style.getPropertyValue('--ph')));

  for (const r of roles) {
    await scrollTo(page, `#role-${r.id}`, 380); // its top just above the middle of the window
    await expect(page.locator(`[data-role="${r.id}"]`)).toHaveAttribute('data-active', 'true');
    await expect(panel.locator(`[data-clip="${r.id}"]`)).toHaveAttribute('data-active', 'true');
    await expect(panel.locator('[data-clip][data-active]')).toHaveCount(1);
    const p = await ph();
    // the playhead sits inside the active clip
    const [clipL, clipR, panelL, panelW] = await panel.locator(`[data-clip="${r.id}"]`).evaluate((el) => {
      const c = el.getBoundingClientRect();
      const t = el.parentElement!.getBoundingClientRect();
      return [c.left, c.right, t.left, t.width];
    });
    const x = panelL! + (panelW! * p) / 100;
    expect(x).toBeGreaterThanOrEqual(clipL! - 2);
    expect(x).toBeLessThanOrEqual(clipR! + 2);
  }
  // reading further down one role moves the playhead back in time, towards its start
  const job = roles.find((r) => r.end_date === null)!;
  await scrollTo(page, `#role-${job.id}`, 430);
  await expect(panel.locator(`[data-clip="${job.id}"]`)).toHaveAttribute('data-active', 'true');
  // let the scroll update land before reading where the playhead is
  let early = -1;
  await expect
    .poll(async () => {
      const prev = early;
      early = await ph();
      return early === prev;
    })
    .toBe(true);
  await scrollTo(page, `#role-${job.id}`, 200);
  await expect.poll(ph).toBeLessThan(early);
  await expect(panel.locator('[class*="playheadLabel"]')).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
});

test('AC-6.8 phones get the vertical timeline', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await open(page);
  await scrollTo(page, '#timeline');
  await expect(page.locator('[data-edit-timeline]')).toBeHidden();
  const roles = page.locator('[data-role]');
  await expect(roles.first()).toBeVisible();
  // one column, stacked
  const boxes = await roles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top).toBeGreaterThan(boxes[i - 1]!.bottom - 1);
  const before = await page
    .locator('#timeline ol')
    .first()
    .evaluate((el) => el.style.getPropertyValue('--fill'));
  await scrollTo(page, `[data-role]:last-child`, 300);
  await expect
    .poll(() =>
      page
        .locator('#timeline ol')
        .first()
        .evaluate((el) => el.style.getPropertyValue('--fill')),
    )
    .not.toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});

test('AC-6.9 dates, "Present", durations and skill meters are right', async ({ page }) => {
  await open(page);
  const roles = await published(page, 'experience');
  const skills = await published(page, 'skills');
  const fmt = (d: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${d.slice(0, 7)}-01T00:00:00Z`))
      .toUpperCase();
  for (const r of roles) {
    const when = page.locator(`#role-${r.id} p.label`);
    const end = r.end_date ? fmt(String(r.end_date)) : 'PRESENT';
    await expect(when).toContainText(`${fmt(String(r.start_date))} – ${end}`, { ignoreCase: true });
  }
  const intern = roles.find((r) => r.employment_type === 'internship')!; // Dec 2022 – May 2023
  await expect(page.locator(`#role-${intern.id} p.label`)).toContainText('6m', { ignoreCase: true });
  const freelance = roles.find((r) => r.employment_type === 'freelance')!; // Feb 2024 – Mar 2025
  await expect(page.locator(`#role-${freelance.id} p.label`)).toContainText('1y 2m', { ignoreCase: true });

  // skills: one track per category, in order; meters match levels
  const categories = [...new Set(skills.map((s) => String(s.category)))];
  const tracks = page.locator('#timeline section[aria-labelledby="skills-title"] > ul > li');
  await expect(tracks).toHaveCount(categories.length);
  for (const [i, c] of categories.entries())
    await expect(tracks.nth(i).locator('> span')).toHaveText(c, { ignoreCase: true });
  for (const s of skills) {
    const chip = page.locator('#timeline li', { has: page.locator(`span:text-is("${s.name}")`) }).last();
    if (s.level != null) {
      await expect(chip.locator('[data-on]')).toHaveCount(Number(s.level));
      await expect(chip).toContainText(`level ${s.level} of 5`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Reviews (RV-1 – RV-4)                                               */
/* ------------------------------------------------------------------ */

test('AC-6.10 one quote at a time: buttons, arrow keys, swipe, announced; no autoplay', async ({ page }) => {
  await open(page);
  const list = await published(page, 'testimonials');
  expect(list.length).toBeGreaterThanOrEqual(3);
  const carousel = page.locator('#reviews [data-carousel]');
  await scrollTo(page, '#reviews');
  const slides = carousel.locator('[data-slide]');
  await expect(slides).toHaveCount(list.length);
  // every quote is in the page
  for (const t of list) await expect(carousel).toContainText(String(t.quote));
  const active = () => carousel.locator('[data-slide][data-active]').getAttribute('data-slide');
  const pos = carousel.locator('[class*="position"]').first();

  expect(await active()).toBe('0');
  await expect(pos).toHaveText(`01 / ${String(list.length).padStart(2, '0')}`);
  // no autoplay
  await page.waitForTimeout(4000);
  expect(await active()).toBe('0');

  await carousel.getByRole('button', { name: 'Next' }).click();
  expect(await active()).toBe('1');
  await expect(pos).toHaveText(/^02 \//);
  await carousel.getByRole('button', { name: 'Previous' }).click();
  await carousel.getByRole('button', { name: 'Previous' }).click();
  expect(await active()).toBe(String(list.length - 1)); // wraps around

  // arrow keys inside the controls
  await carousel.getByRole('button', { name: 'Next' }).focus();
  await page.keyboard.press('ArrowRight');
  expect(await active()).toBe('0');
  await page.keyboard.press('ArrowRight');
  expect(await active()).toBe('1');
  await page.keyboard.press('ArrowLeft');
  expect(await active()).toBe('0');

  // a touch swipe to the left goes forward
  const stage = carousel.locator('[class*="stage"]');
  const box = (await stage.boundingBox())!;
  const y = box.y + box.height / 2;
  await stage.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 7,
    clientX: box.x + 300,
    clientY: y,
  });
  await stage.dispatchEvent('pointerup', {
    pointerType: 'touch',
    pointerId: 7,
    clientX: box.x + 100,
    clientY: y,
  });
  expect(await active()).toBe('1');
  await stage.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 8,
    clientX: box.x + 100,
    clientY: y,
  });
  await stage.dispatchEvent('pointerup', {
    pointerType: 'touch',
    pointerId: 8,
    clientX: box.x + 300,
    clientY: y,
  });
  expect(await active()).toBe('0');

  // the change is announced politely
  const live = carousel.locator('[aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await carousel.getByRole('button', { name: 'Next' }).click();
  await expect(live).toContainText(`2 of ${list.length}`);

  // only the active slide is visible
  await expect
    .poll(() => slides.evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== '0').length))
    .toBe(1);
});

test('AC-6.10 one or two testimonials show as a plain stack', async ({ page }) => {
  await open(page);
  await signInDemo(page);
  const all = await demo<Row[]>(page, 'data.list', 'testimonials');
  for (const t of all.slice(2))
    await demo(page, 'data.update', 'testimonials', t.id, { is_published: false });
  await refresh(page);
  await scrollTo(page, '#reviews');
  await expect(page.locator('#reviews [data-carousel]')).toHaveCount(0);
  await expect(page.locator('#reviews figure')).toHaveCount(2);
  await expect(page.locator('#reviews figure').nth(1)).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* Custom sections (CS-1 – CS-5)                                       */
/* ------------------------------------------------------------------ */

test('AC-6.11 every layout renders, on the home page (max 6 + "See all") and its own page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await open(page);
  await signInDemo(page);
  const sections = await demo<Row[]>(page, 'data.list', 'custom_sections');
  const frames = sections.find((s) => s.slug === 'frames')!;
  const items = await demo<Row[]>(page, 'data.list', 'custom_items', {
    where: { column: 'section_id', value: frames.id },
  });
  // three more stills → 7 items
  for (let i = 0; i < 3; i++) {
    await demo(page, 'data.create', 'custom_items', {
      section_id: frames.id,
      is_published: true,
      sort_order: 10 + i,
      data: { ...(items[0]!.data as Row), title: `Extra still ${i + 1}` },
    });
  }
  await refresh(page);
  const home = page.locator('#s-frames');
  await scrollTo(page, '#s-frames');

  const checks: Record<string, (scope: ReturnType<Page['locator']>) => Promise<void>> = {
    gallery: async (scope) => {
      await expect(scope.locator('button[aria-label^="Open "]').first()).toBeVisible();
    },
    grid: async (scope) => {
      await expect(scope.locator('[class*="card"]').first()).toBeVisible();
    },
    list: async (scope) => {
      await expect(scope.locator('[class*="row"]').first()).toBeVisible();
    },
    timeline: async (scope) => {
      await expect(scope.locator('ol[class*="timeline"] > li').first()).toBeVisible();
      // newest first
      const dates = await scope.locator('[class*="tlDate"]').allTextContents();
      const asTime = dates.map((d) => Date.parse(`1 ${d}`));
      for (let i = 1; i < asTime.length; i++) expect(asTime[i]!).toBeLessThanOrEqual(asTime[i - 1]!);
    },
    carousel: async (scope) => {
      await expect(scope.locator('[data-carousel]')).toBeVisible();
    },
  };

  for (const layout of ['gallery', 'grid', 'list', 'timeline', 'carousel'] as const) {
    const current = (await demo<Row[]>(page, 'data.list', 'custom_sections')).find(
      (s) => s.id === frames.id,
    )!;
    await demo(page, 'data.update', 'custom_sections', frames.id, { layout }, current.updated_at);
    await refresh(page);
    await expect(home.locator(`[data-layout="${layout}"]`)).toBeAttached();
    await checks[layout]!(home);
    // home shows at most 6, with a "See all" link that names the total
    const count =
      layout === 'carousel'
        ? await home.locator('[data-slide]').count()
        : await home.locator('[data-layout] > ul > li, [data-layout] > ol > li').count();
    expect(count, layout).toBe(6);
    await expect(home.getByRole('link', { name: /See all of Frames \(7\)/ })).toBeVisible();
  }

  // the section's own page shows all 7 (client-side navigation keeps the demo data)
  await home.getByRole('link', { name: /See all of Frames/ }).click();
  await expect(page).toHaveURL(/\/s\/frames$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Frames' })).toBeVisible();
  await expect(page.locator('[data-slide]')).toHaveCount(7);
  await expect(page.getByRole('link', { name: /See all/ })).toHaveCount(0);
  // items are h2 on their own page
  await expect(page.getByRole('heading', { level: 2, name: 'Extra still 3' })).toBeAttached();
  expect(errors).toEqual([]);
});

test('AC-6.11 the gallery opens its viewer; the section page renders on a fresh load', async ({ page }) => {
  await open(page, '/s/frames');
  await expect(page.getByRole('heading', { level: 1, name: 'Frames' })).toBeVisible();
  const thumbs = page.locator('button[aria-label^="Open "]');
  await expect(thumbs).toHaveCount(4);
  await thumbs.nth(1).click();
  const viewer = page.locator('dialog[open]');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute('alt', /Night market/);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
});

test('AC-6.11 empty sections are left off the home page and the menu', async ({ page }) => {
  await open(page);
  await signInDemo(page);
  await demo(page, 'data.create', 'custom_sections', {
    name: 'Empty shelf',
    slug: 'empty-shelf',
    layout: 'grid',
    fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
    insert_after: 'reviews',
    show_on_home: true,
    has_page: true,
    show_in_nav: true,
    is_published: true,
  });
  await refresh(page);
  await expect(page.locator('#s-frames')).toBeAttached();
  await page.waitForTimeout(500);
  await expect(page.locator('#s-empty-shelf')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chapters' }).click();
  const menu = page.getByRole('dialog', { name: 'Chapters' });
  await expect(menu.getByText('Frames').first()).toBeVisible();
  await expect(menu.getByText('Empty shelf')).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/* Screens (AC-6.12 also runs in public-screens.spec.ts)                */
/* ------------------------------------------------------------------ */

for (const [width, height] of [
  [375, 812],
  [1440, 900],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`AC-6.12 chapters at ${width}px, ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({
        viewport: { width, height },
        colorScheme: scheme,
        hasTouch: width < 600,
        isMobile: width < 600,
      });
      const page = await ctx.newPage();
      const errors = watchErrors(page);
      await open(page);
      for (const id of ['about', 'credits', 'timeline', 'reviews', 's-talks', 's-frames']) {
        await scrollTo(page, `#${id}`, 64);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `tests/e2e/.results/chapters/${width}-${scheme}-${id}.png` });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}
