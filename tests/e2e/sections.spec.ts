/** Custom sections and the media library (spec 02 §5.3). */
import { expect, test } from '@playwright/test';
import { demo, expectToast, go, keyboardMove, makeImage, rows, signIn } from './helpers';

test('AC-2.20 create a section from the Talks template, add and reorder fields; preview matches', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Manage sections');
  await page.getByRole('link', { name: 'New section' }).click();
  await page.getByRole('button', { name: /^Talks/ }).click();

  await page.getByRole('textbox', { name: /^Name/ }).fill('Conference talks');
  await expect(page.getByRole('textbox', { name: /^Web address/ })).toHaveValue('conference-talks');

  // add a field
  await page.getByRole('button', { name: 'Add field' }).click();
  const labels = page.getByRole('textbox', { name: /^Label/ });
  await labels.last().fill('Audience size');
  await page.getByRole('combobox', { name: /^Type/ }).last().selectOption('number');
  await expect(page.getByRole('textbox', { name: /^Key/ }).last()).toHaveValue('audience_size');

  // move it up one place with the keyboard
  await keyboardMove(page, /^Reorder Audience size/, 'ArrowUp');

  // preview shows the same fields, in the same order
  const preview = page.getByRole('complementary', { name: 'Item form preview' });
  await expect(preview.getByRole('spinbutton', { name: 'Audience size' })).toBeVisible();
  await expect(preview.getByRole('combobox', { name: /^Format/ })).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  const sections = await rows(page, 'custom_sections');
  const created = sections.find((s) => s.slug === 'conference-talks') as
    { fields: { key: string }[] } | undefined;
  expect(created?.fields.map((f) => f.key)).toEqual([
    'title',
    'event',
    'date',
    'format',
    'link',
    'audience_size',
    'photo',
  ]);
  // appears in the navigation
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Conference talks' })).toBeVisible();
});

test("AC-2.21 items are validated by the section's own fields", async ({ page }) => {
  await signIn(page);
  await go(page, 'Talks');
  await page.getByRole('link', { name: 'New item' }).click();
  // Format is a required select → defaults to the first option; Title is required
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'before saving' })).toContainText('Title');
  await page.getByRole('textbox', { name: /^Title/ }).fill('Building cinematic portfolios');
  await page.getByRole('textbox', { name: /^Date/ }).fill('2026-11-02');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  const items = await rows(page, 'custom_items');
  const item = items.find(
    (i) => (i.data as Record<string, unknown>).title === 'Building cinematic portfolios',
  );
  expect(item?.data).toMatchObject({ format: 'Talk', date: '2026-11-02' });
});

test('AC-2.22 removing a field after items exist: warning, values kept as hidden data, then cleared', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Manage sections');
  await page.getByRole('main').getByRole('link', { name: 'Talks', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sections\/[^/]+$/);
  // keys of fields that have items are locked
  await expect(page.getByRole('textbox', { name: /^Key/ }).nth(1)).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: 'Remove field Venue' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 item has values for Venue, which will be hidden.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Saved.');

  // the value is still stored…
  const talksItem = async () =>
    (await rows(page, 'custom_items')).find(
      (i) => (i.data as { title?: string }).title === 'Scaling EDI on Azure',
    )!;
  let item = await talksItem();
  expect((item.data as Record<string, unknown>).venue).toBe('Demo meetup');

  // …and shown as hidden data on the item
  await go(page, 'Talks');
  await page.getByRole('link', { name: 'Scaling EDI on Azure' }).click();
  const hidden = page.locator('section', { has: page.getByRole('heading', { name: 'Hidden data' }) });
  await expect(hidden).toContainText('venue');
  await expect(hidden).toContainText('Demo meetup');
  await expect(hidden).toContainText('old_rating');
  await hidden.getByRole('button', { name: 'Remove hidden data' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Saved.');
  item = await talksItem();
  expect(item.data).not.toHaveProperty('venue');
  expect(item.data).not.toHaveProperty('old_rating');
  expect((item.data as Record<string, unknown>).title).toBe('Scaling EDI on Azure');
});

test('AC-2.23 deleting a section says how many items go with it', async ({ page }) => {
  await signIn(page);
  await go(page, 'Manage sections');
  await page.getByRole('button', { name: 'Delete Talks' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 item in this section will be deleted too.');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expectToast(page, 'Deleted Talks');
  const sections = await rows(page, 'custom_sections');
  expect(sections.some((s) => s.name === 'Talks')).toBe(false);
  const items = await rows(page, 'custom_items');
  // only the Talks item went; other sections keep theirs
  expect(items.every((i) => sections.some((s) => s.id === i.section_id))).toBe(true);
  expect(items.some((i) => (i.data as { title?: string }).title === 'Scaling EDI on Azure')).toBe(false);
});

test('AC-2.24 media library: "Used by" is correct and unused files can be deleted', async ({ page }) => {
  await signIn(page);
  await go(page, 'Media library');
  const card = (name: string) => page.getByRole('listitem').filter({ hasText: name });
  await expect(card('projects/demo-edi.webp')).toContainText('Supply-chain EDI pipeline'); // cover
  await expect(card('projects/demo-dashboard.webp')).toContainText('Supply-chain EDI pipeline'); // gallery
  await expect(card('hero/demo-poster.webp')).toContainText('Demo drone reel'); // hero poster
  await expect(card('portrait/demo-portrait.webp')).toContainText('Site settings');
  await expect(card('talks/demo-stage.webp')).toContainText('Scaling EDI on Azure'); // custom item image
  await expect(card('unused/demo-orphan.webp')).toContainText('Unused');

  // a resume uploaded in settings shows as used by Site settings
  await go(page, 'Site settings');
  await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF'),
  });
  // Save waits for the upload (the button is busy until it finishes)
  await expect(page.getByRole('link', { name: /\.pdf$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expectToast(page, 'Settings saved.');
  await go(page, 'Media library');
  await page.getByRole('button', { name: /^Documents/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: '.pdf' })).toContainText('Site settings');

  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByRole('button', { name: 'Delete 1 unused' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expectToast(page, 'Deleted 1 file');
  const images = await demo<{ path: string }[]>(page, 'files.listAll', 'images');
  expect(images.some((f) => f.path.includes('orphan'))).toBe(false);
  expect(images.some((f) => f.path.includes('demo-edi'))).toBe(true);
});

test('AD-14 deleting an item removes files only it used; files shared with a duplicate stay', async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Achievements');
  // duplicate shares the badge image with the original
  await page.getByRole('button', { name: 'Duplicate Demo certification' }).click();
  await expectToast(page, 'Created a draft copy');
  await page.getByRole('button', { name: 'Delete Demo certification', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expectToast(page, 'Deleted Demo certification');
  const badge = 'images/achievements/demo-badge.webp';
  const has = async () =>
    (await demo<{ path: string }[]>(page, 'files.listAll', 'images')).some((f) => f.path === badge);
  await page.waitForTimeout(300);
  expect(await has()).toBe(true); // still used by the copy

  await page.getByRole('button', { name: 'Delete Demo certification (copy)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect.poll(has).toBe(false);
});

test('MediaSession: an image uploaded into a form that is then abandoned is cleaned up', async ({ page }) => {
  await signIn(page);
  await go(page, 'Projects');
  await page.getByRole('link', { name: 'New project' }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await makeImage(page, 800, 600));
  await expect(page.getByText('800 × 600px')).toBeVisible();
  const count = async () => (await demo<unknown[]>(page, 'files.listAll', 'images')).length;
  const withUpload = await count();
  await go(page, 'Skills');
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect.poll(count).toBe(withUpload - 1);
});
