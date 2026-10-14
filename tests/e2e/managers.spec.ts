/** Managing content (spec 02 §5.2). */
import { expect, test, type Page } from '@playwright/test';
import {
  demo,
  expectToast,
  go,
  makeImage,
  makeVideo,
  rows,
  signIn,
  watchErrors,
  keyboardMove,
} from './helpers';

/** Each built-in manager: create (minimal valid values), publish, duplicate, delete (AC-2.9). */
const managers: {
  nav: string;
  table: string;
  newLabel: string;
  fill: (page: Page) => Promise<void>;
  title: string;
}[] = [
  {
    nav: 'Projects',
    table: 'projects',
    newLabel: 'New project',
    title: 'Test project',
    fill: async (p) => {
      await p.getByRole('textbox', { name: 'Title' }).fill('Test project');
      await p.getByRole('textbox', { name: 'Summary' }).fill('A project made by the test.');
    },
  },
  {
    nav: 'Achievements',
    table: 'achievements',
    newLabel: 'New achievement',
    title: 'Test award',
    fill: async (p) => {
      await p.getByRole('textbox', { name: 'Title' }).fill('Test award');
    },
  },
  {
    nav: 'Experience',
    table: 'experience',
    newLabel: 'New role',
    title: 'Engineer · Test Co',
    fill: async (p) => {
      await p.getByRole('textbox', { name: /^Role/ }).fill('Engineer');
      await p.getByRole('textbox', { name: 'Company' }).fill('Test Co');
      await p.getByLabel('Start date').fill('2024-02-01');
    },
  },
  {
    nav: 'Skills',
    table: 'skills',
    newLabel: 'New skill',
    title: 'Rust',
    fill: async (p) => {
      await p.getByRole('textbox', { name: 'Name' }).fill('Rust');
      await p.getByRole('combobox', { name: 'Category' }).fill('Backend');
    },
  },
  {
    nav: 'Testimonials',
    table: 'testimonials',
    newLabel: 'New testimonial',
    title: 'Test Person',
    fill: async (p) => {
      await p.getByRole('textbox', { name: 'Quote' }).fill('Excellent work, delivered on time.');
      await p.getByRole('textbox', { name: 'Name' }).fill('Test Person');
    },
  },
];

for (const m of managers) {
  test(`AC-2.9 ${m.nav}: create, publish, duplicate, delete`, async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page);
    await go(page, m.nav);
    const before = (await rows(page, m.table)).length;

    await page.getByRole('link', { name: m.newLabel }).click();
    await m.fill(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expectToast(page, 'Saved.');
    await expect(page).toHaveURL(
      new RegExp(`/admin/${m.nav === 'Hero media' ? 'hero' : m.table}/[0-9a-f-]{36}$`),
    );
    expect((await rows(page, m.table)).length).toBe(before + 1);

    await go(page, m.nav);
    const row = page.locator('li', { has: page.getByRole('link', { name: m.title, exact: true }) });
    await row.locator('label').first().click(); // the visible switch track
    await expect(row.getByRole('switch')).toBeChecked();
    await expectToast(page, `${m.title} published`);
    expect(
      (await rows(page, m.table)).find(
        (r) => String(r.title ?? r.name ?? r.author_name ?? r.role).length && r.is_published,
      ),
    ).toBeTruthy();

    await row.getByRole('button', { name: `Duplicate ${m.title}` }).click();
    await expectToast(page, 'Created a draft copy');
    expect((await rows(page, m.table)).length).toBe(before + 2);

    await row.getByRole('button', { name: `Delete ${m.title}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expectToast(page, `Deleted ${m.title}`);
    expect((await rows(page, m.table)).length).toBe(before + 1);
    expect(errors).toEqual([]);
  });
}

test('AC-2.9 Hero media: create with an external URL and an uploaded poster', async ({ page }) => {
  await signIn(page);
  await go(page, 'Hero media');
  await page.getByRole('link', { name: 'New clip' }).click();
  await page.getByLabel('Title').fill('Night drive');
  await page.getByLabel('Source').selectOption('url');
  await page.getByLabel('Video (MP4)').fill('https://cdn.example.com/night.mp4');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await makeImage(page, 1920, 1080));
  await page.getByLabel('Alt text').fill('City lights at night');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  const hero = await rows(page, 'hero_media');
  expect(hero.some((h) => h.title === 'Night drive')).toBe(true);
});

test('AC-2.9 Site settings: edit and save', async ({ page }) => {
  await signIn(page);
  await go(page, 'Site settings');
  await page.getByLabel('Tagline').fill('Builds pipelines, shoots films.');
  await page.getByLabel('GitHub').fill('https://github.com/iamausafhussain');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expectToast(page, 'Settings saved.');
  const s = await demo<Record<string, unknown>>(page, 'data.getSettings');
  expect(s.tagline).toBe('Builds pipelines, shoots films.');
});

test('AC-2.9 / AC-2.27 reorder with the keyboard only', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  const first = (await rows(page, 'projects'))[0]!;
  await keyboardMove(page, /^Reorder Supply-chain EDI pipeline/, 'ArrowDown');
  await expect.poll(async () => (await rows(page, 'projects'))[1]?.id).toBe(first.id);
});

test('AC-2.10 invalid input: field errors, a summary that takes focus, nothing saved', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  const before = (await rows(page, 'projects')).length;
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const summary = page.getByRole('alert').filter({ hasText: 'before saving' });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('listitem')).toHaveCount(3); // title, web address, summary
  await expect(page.getByText('Required').first()).toBeVisible();
  expect((await rows(page, 'projects')).length).toBe(before);
});

test('AC-2.11 duplicate web address shows a plain message on the field', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByLabel('Title').fill('Supply-chain EDI pipeline');
  await page.getByLabel('Summary').fill('Same address as an existing project.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('That web address is already used by another project.').first()).toBeVisible();
});

test('AC-2.12 leaving a changed form asks first; an unchanged form does not', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await go(page, 'Skills');
  await expect(page).toHaveURL(/\/admin\/skills$/);

  await go(page, 'Projects');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  await page.getByLabel('Title').fill('Drone reel 2026 (edited)');
  await go(page, 'Skills');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Leave without saving?');
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(/\/admin\/projects\//);
  await go(page, 'Skills');
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/admin\/skills$/);
});

test('AC-2.13 saving over a newer version shows the conflict notice; Reload shows the newer data', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  const id = page.url().split('/').pop()!;
  // the same project changes "somewhere else"
  await demo(page, 'data.update', 'projects', id, { summary: 'Changed in another tab.' }, null);
  await page.getByLabel('Title').fill('My edit');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/was changed somewhere else/)).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByLabel('Summary')).toHaveValue('Changed in another tab.');
  await expect(page.getByLabel('Title')).toHaveValue('Drone reel 2026');
});

test('AC-2.14 / AC-2.15 / AC-2.19 big JPEG becomes a ≤2560px WebP; alt text required; replaced file removed', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  const id = page.url().split('/').pop()!;
  const oldPath = 'images/projects/demo-reel.webp';

  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await makeImage(page, 6000, 4000));
  await expect(page.getByText('2560 × 1707px')).toBeVisible({ timeout: 30_000 });

  // alt text is empty → can't save
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'before saving' })).toContainText('Alt');

  await page.getByLabel('Alt text').fill('Aerial view of the river');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');

  const row = await demo<{ cover: { path: string; width: number; height: number } }>(
    page,
    'data.get',
    'projects',
    id,
  );
  expect(row.cover.path).toMatch(/^images\/projects\/[0-9a-f-]+\.webp$/);
  expect(row.cover.width).toBe(2560);
  expect(row.cover.height).toBe(1707);
  const files = await demo<{ path: string; contentType: string }[]>(page, 'files.listAll', 'images');
  expect(files.find((f) => f.path === row.cover.path)?.contentType).toBe('image/webp');
  await expect
    .poll(async () =>
      (await demo<{ path: string }[]>(page, 'files.listAll', 'images')).some((f) => f.path === oldPath),
    )
    .toBe(false);
});

test('AC-2.17 videos over 15 MB are refused; over 4 MB uploads with a warning', async ({ page }) => {
  await signIn(page);
  await go(page, 'Hero media');
  await page.getByRole('link', { name: 'New clip' }).click();
  const input = page.locator('input[type=file][accept="video/mp4"]').first();
  await input.setInputFiles({
    name: 'big.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.alloc(16 * 1024 * 1024),
  });
  await expect(page.getByText(/This file is 16\.0 MB — the limit is 15\.0 MB/)).toBeVisible();

  await input.setInputFiles({ name: 'ok.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(5 * 1024 * 1024) });
  await expect(page.getByText(/This video is 5\.0 MB/)).toBeVisible();
  await expect
    .poll(async () => (await demo<{ path: string }[]>(page, 'files.listAll', 'videos')).length)
    .toBe(1);
});

test('AC-2.18 a poster can be captured from the uploaded video', async ({ page }) => {
  await signIn(page);
  await go(page, 'Hero media');
  await page.getByRole('link', { name: 'New clip' }).click();
  const clip = await makeVideo(page);
  await page
    .locator('input[type=file][accept="video/mp4"]')
    .first()
    .setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: clip });
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
  });
  await page.getByRole('button', { name: 'Capture from video' }).click();
  await expect(page.getByLabel('Alt text')).toBeVisible();
  await expect(page.getByText('320 × 180px')).toBeVisible();
});

test('AC-2.16 an SVG with a script and onload is cleaned before upload', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'Drone reel 2026' }).click();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" onload="alert(1)"><script>alert(2)</script><rect width="100" height="50" fill="#123456"/><a href="javascript:alert(3)"><text y="20">x</text></a></svg>`;
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.getByText('100 × 50px')).toBeVisible();
  const files = await demo<{ path: string }[]>(page, 'files.listAll', 'images');
  const uploaded = files.find((f) => f.path.endsWith('.svg'))!;
  const text = await page.evaluate(
    async (url) => (await fetch(url)).text(),
    await page.evaluate(
      (p) =>
        (window as unknown as { __demoRepo: { files: { url(p: string): string } } }).__demoRepo.files.url(p),
      uploaded.path,
    ),
  );
  expect(text).not.toContain('<script');
  expect(text).not.toContain('onload');
  expect(text).not.toContain('javascript:');
  expect(text).toContain('<rect');
});

test('AC-2.25 dashboard counts match the data', async ({ page }) => {
  await signIn(page);
  const projects = await rows(page, 'projects');
  const published = projects.filter((p) => p.is_published).length;
  const card = page
    .locator('div', { has: page.getByRole('link', { name: 'Projects', exact: true }) })
    .filter({ hasText: 'published' })
    .last();
  await expect(card).toContainText(`${published} published`);
  await expect(card).toContainText(`${projects.length - published} draft`);
});
