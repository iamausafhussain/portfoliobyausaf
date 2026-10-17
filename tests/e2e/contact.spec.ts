/**
 * Part 7 — Final Scene and the admin inbox (spec 07 §5), against the demo site.
 * The demo backend applies the same limits and link rule as the database, and keeps its
 * data only until a reload, so the tests read it back through window.__demoRepo.
 */
import { expect, test, type Page } from '@playwright/test';
import { demo, DEMO, expectToast, go, watchErrors } from './helpers';

test.describe.configure({ retries: 2 });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface Msg {
  id: string;
  name: string;
  email: string;
  kind: string;
  subject: string;
  body: string;
  budget: string | null;
  status: string;
}

async function openContact(page: Page, init: { draft?: Record<string, string> } = {}) {
  await page.addInitScript((o) => {
    sessionStorage.setItem('intro-played', '1');
    if (o.draft) sessionStorage.setItem('contact-draft', JSON.stringify(o.draft));
  }, init);
  await page.goto('/?tier=low');
  await page.waitForFunction(() => '__demoRepo' in window);
  await page.locator('#contact form[data-contact]').waitFor();
  await page.evaluate(() => {
    const el = document.getElementById('contact')!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
  });
}

/** Reloads and waits for both the demo backend and the form. */
async function reloadContact(page: Page) {
  await page.reload();
  await page.waitForFunction(() => '__demoRepo' in window);
  await page.locator('#contact form[data-contact]').waitFor();
}

const form = (page: Page) => page.locator('#contact');
const send = (page: Page) => form(page).getByRole('button', { name: /Send message|Sending/ });

/** Fills the form like a person (and waits past the 3-second time trap before sending). */
async function fill(
  page: Page,
  v: { kind?: string; name?: string; email?: string; subject?: string; body?: string; budget?: string },
) {
  if (v.kind) await form(page).getByRole('radio', { name: v.kind }).check();
  if (v.name !== undefined) await form(page).getByLabel('Name').fill(v.name);
  if (v.email !== undefined) await form(page).getByLabel('Email').fill(v.email);
  if (v.subject !== undefined) await form(page).getByLabel('Subject (optional)').fill(v.subject);
  if (v.body !== undefined) await form(page).getByLabel('Message').fill(v.body);
  if (v.budget !== undefined) await form(page).getByLabel('Budget (optional)').fill(v.budget);
}
const pastTimeTrap = (page: Page) => page.waitForTimeout(3100);

/** Signs in to the demo backend and returns its messages, newest first. */
async function inbox(page: Page, tab = 'all'): Promise<Msg[]> {
  const signedIn = await page.evaluate(async () => {
    const repo = (window as unknown as { __demoRepo: { auth: { getState(): Promise<{ status: string }> } } })
      .__demoRepo;
    return (await repo.auth.getState()).status === 'signed_in';
  });
  if (!signedIn) {
    await demo(page, 'auth.signIn', DEMO.email, 'any-password');
    const setup = await demo<{ factorId: string }>(page, 'auth.startTotpSetup');
    await demo(page, 'auth.finishTotpSetup', setup.factorId, DEMO.code);
  }
  return (await demo<{ rows: Msg[] }>(page, 'messages.list', { tab, limit: 200 })).rows;
}

/** Signs in through the admin UI after arriving client-side (a reload would reset the demo data). */
async function openInbox(page: Page, path = '/admin/login') {
  await page.goto(path);
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.waitForURL(/\/admin\/?$/);
  await go(page, 'Inbox');
  await page.locator('[data-inbox-list]').waitFor();
}

const badge = (page: Page) => page.locator('[data-badge]').first();
const tab = (page: Page, t: string) => page.locator(`[data-tab="${t}"]`);

/* ------------------------------------------------------------------ */
/* Final Scene (CT)                                                    */
/* ------------------------------------------------------------------ */

test('AC-7.1 a valid message sends, shows "That’s a wrap." and lands in the inbox as New', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openContact(page);
  // slate header
  await expect(form(page).locator('[data-slate]')).toContainText(/SCENE\s+\d{2}/i);
  await expect(form(page).locator('[data-take]')).toContainText('01');
  await expect(form(page).getByRole('radio', { name: 'Just saying hi' })).toBeChecked();

  await fill(page, {
    kind: 'Freelance project',
    name: 'Priya Sharma',
    email: 'Priya@Example.com',
    subject: 'Booking site',
    body: 'Hi Ausaf, we need a booking site rebuilt in React. Interested?',
    budget: '₹1–2L',
  });
  await pastTimeTrap(page);
  await send(page).click();

  await expect(form(page).getByRole('heading', { name: 'That’s a wrap.' })).toBeFocused();
  await expect(form(page).locator('[data-wrap]')).toContainText('Thanks, Priya Sharma');
  await expect(form(page).locator('[data-wrap]')).toContainText('Priya@Example.com');
  await expect(form(page).getByText('I usually reply within a couple of days.')).toBeVisible();
  await expect(form(page).getByRole('status')).toHaveText(/Message sent/);
  await expect(form(page).locator('[data-clapper]')).toHaveAttribute('data-closed', 'true');

  const [m] = await inbox(page);
  expect(m).toMatchObject({
    name: 'Priya Sharma',
    email: 'priya@example.com',
    kind: 'freelance',
    subject: 'Booking site',
    body: 'Hi Ausaf, we need a booking site rebuilt in React. Interested?',
    budget: '₹1–2L',
    status: 'new',
  });

  // the draft is cleared, and "Send another" brings back an empty form
  expect(await page.evaluate(() => sessionStorage.getItem('contact-draft'))).toBeNull();
  await form(page).getByRole('button', { name: 'Send another message' }).click();
  await expect(form(page).getByLabel('Name')).toBeFocused();
  await expect(form(page).getByLabel('Name')).toHaveValue('');
  await expect(form(page).locator('[data-take]')).toContainText('02');
  expect(errors).toEqual([]);
});

test('AC-7.2 each field explains what’s wrong; Send focuses the first problem and sends nothing', async ({
  page,
}) => {
  await openContact(page);
  const before = (await inbox(page)).length;
  await send(page).click();
  await expect(form(page).getByLabel('Name')).toBeFocused();
  await expect(form(page).getByText('Please add your name.')).toBeVisible();
  await expect(form(page).getByText('Please add your email so I can reply.')).toBeVisible();
  await expect(form(page).getByText('Please write a message.')).toBeVisible();
  await expect(form(page).getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(form(page).getByLabel('Name')).toHaveAccessibleDescription('Please add your name.');

  await fill(page, { name: 'Ravi', email: 'not-an-email', body: 'too short' });
  await send(page).click();
  await expect(form(page).getByLabel('Email')).toBeFocused();
  await expect(form(page).getByText('Enter a valid email address.')).toBeVisible();
  await expect(form(page).getByText('Please write at least 10 characters.')).toBeVisible();
  await expect(form(page).getByText('Please add your name.')).toHaveCount(0);

  // errors appear when you leave a field, not while you're still typing in it
  await reloadContact(page);
  await form(page).getByLabel('Subject (optional)').fill('x'.repeat(151));
  await expect(form(page).getByText('Keep it to 150 characters.')).toHaveCount(0);
  await form(page).getByLabel('Message').focus();
  await expect(form(page).getByText('Keep it to 150 characters.')).toBeVisible();

  // the long-message counter
  await form(page).getByLabel('Message').fill('x'.repeat(4100));
  await expect(form(page).locator('[data-counter]')).toHaveText('4,100 / 5,000');
  expect((await inbox(page)).length).toBe(before);
});

test('AC-7.3 Budget only shows for Freelance and isn’t sent otherwise', async ({ page }) => {
  await openContact(page);
  await expect(form(page).getByLabel('Budget (optional)')).toHaveCount(0);
  await form(page).getByRole('radio', { name: 'Freelance project' }).check();
  await expect(form(page).getByLabel('Budget (optional)')).toBeVisible();
  await fill(page, {
    name: 'Neha',
    email: 'neha@example.com',
    body: 'Changed my mind about the budget.',
    budget: '50k',
  });
  await form(page).getByRole('radio', { name: 'Hiring' }).check();
  await expect(form(page).getByLabel('Budget (optional)')).toHaveCount(0);
  await pastTimeTrap(page);
  await send(page).click();
  await expect(form(page).locator('[data-wrap]')).toBeVisible();
  const [m] = await inbox(page);
  expect(m).toMatchObject({ name: 'Neha', kind: 'hire', budget: null });
});

test('AC-7.4 a failed send keeps the text, says why and offers a pre-filled email; drafts survive a reload', async ({
  page,
}) => {
  await openContact(page);
  await fill(page, {
    name: 'Arjun',
    email: 'arjun@example.com',
    subject: 'Hello',
    body: 'A message that fails to send.',
  });

  // the draft survives a reload
  await reloadContact(page);
  await expect(form(page).getByLabel('Name')).toHaveValue('Arjun');
  await expect(form(page).getByLabel('Message')).toHaveValue('A message that fails to send.');

  for (const [code, text] of [
    ['offline', 'Couldn’t reach the server'],
    ['server', 'Something went wrong on my side'],
    ['rate_limited', 'You’ve sent a few messages already'],
  ] as const) {
    await page.evaluate(
      (c) => (window as unknown as { __demoRepo: { failSends(c: string): void } }).__demoRepo.failSends(c),
      code,
    );
    await pastTimeTrap(page);
    await send(page).click();
    const alert = form(page).getByRole('alert');
    await expect(alert).toContainText(text);
    await expect(alert).toBeFocused();
    await expect(form(page).getByLabel('Message')).toHaveValue('A message that fails to send.');
    const href = await alert.getByRole('link', { name: 'Email it to me instead' }).getAttribute('href');
    const url = new URL(href!);
    expect(url.pathname).toBe('hello@example.com');
    expect(url.searchParams.get('subject')).toBe('Hello');
    expect(url.searchParams.get('body')).toContain('A message that fails to send.');
  }
  // each failed attempt is a new take
  await expect(form(page).locator('[data-take]')).toContainText('04');

  // a real send right after a failure is not mistaken for a bot
  await page.evaluate(() =>
    (window as unknown as { __demoRepo: { failSends(c: null): void } }).__demoRepo.failSends(null),
  );
  await send(page).click();
  await expect(form(page).locator('[data-wrap]')).toBeVisible();
  expect((await inbox(page))[0]).toMatchObject({ name: 'Arjun' });
});

test('AC-7.5 your email, availability, location and socials show when set, and are left out when not', async ({
  page,
}) => {
  await openContact(page);
  const details = form(page).getByRole('complementary', { name: 'Other ways to reach me' });
  await expect(details.getByRole('link', { name: 'hello@example.com' })).toHaveAttribute(
    'href',
    'mailto:hello@example.com',
  );
  await expect(details.getByText('Available for work')).toBeVisible();
  await expect(details.getByText('Bhubaneswar, India')).toBeVisible();
  await expect(details.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
    'href',
    'https://github.com/iamausafhussain',
  );
  await expect(details.getByRole('link', { name: /Download résumé/ })).toHaveCount(0);

  await inbox(page); // signs in
  const s = await demo<{ updated_at: string }>(page, 'data.getSettings');
  await demo(
    page,
    'data.updateSettings',
    {
      public_email: null,
      available_for_work: false,
      location: '',
      socials: {},
      resume_path: 'https://example.com/resume.pdf',
    },
    s.updated_at,
  );
  await page.evaluate(() =>
    (
      window as unknown as { __queryClient: { invalidateQueries(): Promise<void> } }
    ).__queryClient.invalidateQueries(),
  );
  await expect(details.getByRole('link', { name: /Download résumé/ })).toBeVisible();
  await expect(details.getByText('Available for work')).toHaveCount(0);
  await expect(details.getByText('Email', { exact: true })).toHaveCount(0);
  await expect(details.getByText('Elsewhere')).toHaveCount(0);
  await expect(details.getByText('Based in')).toHaveCount(0);
});

test('AC-7.6 phones: one column, 16 px fields with the right keyboards, nothing under the dock', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openContact(page);
  const f = form(page);
  // form above the details, both full width
  const formBox = (await f.locator('[data-contact-slate]').boundingBox())!;
  const detailsBox = (await f.getByRole('complementary').boundingBox())!;
  expect(detailsBox.y).toBeGreaterThan(formBox.y + formBox.height - 1);
  expect(formBox.width).toBeGreaterThan(330);

  for (const label of ['Name', 'Email', 'Subject (optional)', 'Message']) {
    const size = await f.getByLabel(label).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, label).toBeGreaterThanOrEqual(16);
  }
  await expect(f.getByLabel('Email')).toHaveAttribute('type', 'email');
  await expect(f.getByLabel('Email')).toHaveAttribute('autocomplete', 'email');
  await expect(f.getByLabel('Name')).toHaveAttribute('autocomplete', 'name');

  // while typing, the dock slides away so it can't cover the field or Send
  const dock = page.getByRole('navigation', { name: 'Fast lane' }).last();
  await f.getByLabel('Message').focus();
  await expect.poll(async () => (await dock.boundingBox())?.y ?? 9999).toBeGreaterThan(812);
  await f.getByLabel('Message').blur();
  await expect.poll(async () => (await dock.boundingBox())?.y ?? 9999).toBeLessThan(812);

  // the Send button is full width
  const sendBox = (await send(page).boundingBox())!;
  const formWidth = await f.locator('form[data-contact]').evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });
  expect(Math.abs(sendBox.width - formWidth)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
/* Spam and abuse (SP)                                                 */
/* ------------------------------------------------------------------ */

test('AC-7.7 a filled honeypot, or a send within 3 seconds, looks sent but stores nothing', async ({
  page,
}) => {
  await openContact(page);
  const before = (await inbox(page)).length;

  // the honeypot is out of sight and out of the tab order
  const trap = form(page).locator('input[name="website"]');
  await expect(trap).toHaveAttribute('tabindex', '-1');
  const box = (await trap.boundingBox())!;
  expect(box.x + box.width).toBeLessThan(0);

  await fill(page, { name: 'Bot', email: 'bot@example.com', body: 'Buy cheap followers now!!!' });
  await trap.fill('http://spam.example', { force: true });
  await pastTimeTrap(page);
  await send(page).click();
  await expect(form(page).locator('[data-wrap]')).toBeVisible();
  expect((await inbox(page)).length).toBe(before);

  // too fast: a fresh page, filled and sent at once
  await reloadContact(page);
  await fill(page, {
    name: 'Speedy',
    email: 'speedy@example.com',
    body: 'Sent faster than any person could type.',
  });
  await send(page).click();
  await expect(form(page).locator('[data-wrap]')).toBeVisible();
  expect((await inbox(page)).some((m) => m.name === 'Speedy')).toBe(false);
});

test('AC-7.8 the 4th message within 10 minutes is refused with a friendly message', async ({ page }) => {
  test.setTimeout(90_000);
  await openContact(page);
  for (let i = 1; i <= 3; i++) {
    await fill(page, {
      name: `Visitor ${i}`,
      email: `v${i}@example.com`,
      body: `Message number ${i} from the same visitor.`,
    });
    await pastTimeTrap(page);
    await send(page).click();
    await expect(form(page).locator('[data-wrap]')).toBeVisible();
    await form(page).getByRole('button', { name: 'Send another message' }).click();
  }
  await fill(page, {
    name: 'Visitor 4',
    email: 'v4@example.com',
    body: 'And a fourth one, which is too many.',
  });
  await pastTimeTrap(page);
  await send(page).click();
  await expect(form(page).getByRole('alert')).toContainText('You’ve sent a few messages already');
  expect((await inbox(page)).filter((m) => /^Visitor/.test(m.name))).toHaveLength(3);
});

test('AC-7.9 a message with more than 5 links is refused', async ({ page }) => {
  await openContact(page);
  const links = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join(' ');
  await fill(page, { name: 'Linker', email: 'links@example.com', body: `Look at these: ${links}` });
  await pastTimeTrap(page);
  await send(page).click();
  await expect(form(page).getByRole('alert')).toContainText('Please keep it to 5 or fewer');
  expect((await inbox(page)).some((m) => m.name === 'Linker')).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Inbox (IB)                                                          */
/* ------------------------------------------------------------------ */

test('AC-7.11 the badge and dashboard count new messages; opening one marks it read', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.waitForURL(/\/admin\/?$/);

  await expect(badge(page)).toHaveText('3 new');
  await expect(page.getByRole('main').getByText(/3\s+unread/)).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'New messages' }).click();
  await expect(page).toHaveURL(/\/admin\/inbox$/);

  const first = page.locator('[data-row]').first();
  await expect(first).toHaveAttribute('data-status', 'new');
  await expect(first).toContainText('New:');
  await first.click();
  await expect(page.locator('[data-message]')).toHaveAttribute('data-status', 'read');
  await expect(badge(page)).toHaveText('2 new');
  await expect(tab(page, 'new')).toContainText('2');
  await expect(page.getByRole('heading', { level: 2, name: 'Senior .NET role' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('AC-7.12 tabs, kind chips and search filter the list; "Load more" shows older messages', async ({
  page,
}) => {
  await openInbox(page);
  const names = () => page.locator('[data-row] [class*="rowName"]').allTextContents();

  await expect(tab(page, 'all')).toContainText('7');
  await expect.poll(names).toHaveLength(7);
  await tab(page, 'new').click();
  await expect(page).toHaveURL(/tab=new/);
  await expect.poll(names).toEqual(['Demo Recruiter', 'Demo Founder', 'Demo Creator']);
  await tab(page, 'archived').click();
  await expect.poll(names).toEqual(['Demo Old Friend', 'Demo Lead']);
  await tab(page, 'replied').click();
  await expect.poll(names).toEqual(['Demo Hiring Manager', 'Demo Filmmaker']);

  await tab(page, 'all').click();
  await page.locator('[data-kind-filter="freelance"]').click();
  await expect.poll(names).toEqual(['Demo Founder', 'Demo Agency']);
  await page.locator('[data-kind-filter="freelance"]').click(); // off again
  await expect.poll(names).toHaveLength(7);

  await page.getByRole('searchbox', { name: 'Search messages' }).fill('globe');
  await expect.poll(names).toEqual(['Demo Reader']);
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('nothing matches this');
  await expect(page.getByText('No messages match.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('');
  await expect.poll(names).toHaveLength(7);

  // past one page
  await page.evaluate(() =>
    (window as unknown as { __demoRepo: { addMessages(n: number): void } }).__demoRepo.addMessages(60),
  );
  await page.evaluate(() =>
    (
      window as unknown as { __queryClient: { invalidateQueries(): Promise<void> } }
    ).__queryClient.invalidateQueries(),
  );
  await expect.poll(names).toHaveLength(50);
  await expect(page.getByText('Showing 50 of 67')).toBeVisible();
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect.poll(names).toHaveLength(67);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('AC-7.13 Reply, Copy email, Mark as unread, Archive / Move to inbox and Delete', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openInbox(page);
  // keep mailto clicks inside the test
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as HTMLElement).closest('a[href^="mailto:"]')) e.preventDefault();
      },
      true,
    ),
  );
  const view = page.locator('[data-message]');
  await page.locator('[data-row]').filter({ hasText: 'Demo Founder' }).click();
  await expect(view).toHaveAttribute('data-status', 'read');

  // Reply
  const reply = view.getByRole('link', { name: 'Reply' });
  const url = new URL((await reply.getAttribute('href'))!);
  expect(url.pathname).toBe('founder@example.com');
  expect(url.searchParams.get('subject')).toBe('Re: Dashboard for our warehouse');
  expect(url.searchParams.get('body')).toContain('> Demo — we need a small dashboard');
  await reply.click();
  await expect(view).toHaveAttribute('data-status', 'replied');

  // Copy email
  await view.getByRole('button', { name: 'Copy email' }).click();
  await expectToast(page, 'Email copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('founder@example.com');

  // Mark as unread → back to the list, bold again
  await view.getByRole('button', { name: 'Mark as unread' }).click();
  await expectToast(page, 'Marked as unread.');
  await expect(page).toHaveURL(/\/admin\/inbox$/);
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Founder' })).toHaveAttribute(
    'data-status',
    'new',
  );

  // Archive → leaves "All", the next message opens
  await page.locator('[data-row]').filter({ hasText: 'Demo Creator' }).click();
  await view.getByRole('button', { name: 'Archive' }).click();
  await expectToast(page, 'Archived.');
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Creator' })).toHaveCount(0);
  await expect(view.getByRole('heading', { level: 2 })).not.toHaveText('Drone shoot in Odisha?');

  // Move to inbox from the Archived tab
  await tab(page, 'archived').click();
  await page.locator('[data-row]').filter({ hasText: 'Demo Creator' }).click();
  await view.getByRole('button', { name: 'Move to inbox' }).click();
  await expectToast(page, 'Moved back to the inbox.');
  await tab(page, 'all').click();
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Creator' })).toHaveAttribute(
    'data-status',
    'read',
  );

  // Delete asks first; Cancel keeps it
  await page.locator('[data-row]').filter({ hasText: 'Demo Agency' }).click();
  await view.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this message?' });
  await expect(dialog).toContainText('can’t be undone');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Agency' })).toHaveCount(1);
  await view.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expectToast(page, 'Message deleted.');
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Agency' })).toHaveCount(0);
  expect((await inbox(page)).some((m) => m.name === 'Demo Agency')).toBe(false);
});

test('AC-7.14 plain text only; next / previous and j / k / e work', async ({ page }) => {
  await openInbox(page);
  await page.locator('[data-row]').filter({ hasText: 'Demo Reader' }).click();
  const body = page.locator('[data-message-body]');
  await expect(body).toContainText('<b>This should show as plain text</b>');
  await expect(body.locator('b, a, script')).toHaveCount(0);

  const title = () => page.locator('[data-message] h2').textContent();
  await page.getByRole('button', { name: 'Older message' }).click();
  await expect.poll(title).toBe('Website rebuild');
  await page.getByRole('button', { name: 'Newer message' }).click();
  await expect.poll(title).toBe('(no subject)');

  await page.keyboard.press('k');
  await expect.poll(title).toBe('Drone shoot in Odisha?');
  await page.keyboard.press('j');
  await expect.poll(title).toBe('(no subject)');
  await page.keyboard.press('j');
  await expect.poll(title).toBe('Website rebuild');
  // shortcuts don't fire while typing
  await page.getByRole('searchbox', { name: 'Search messages' }).focus();
  await page.keyboard.press('j');
  await expect.poll(title).toBe('Website rebuild');
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('');
  await page.locator('[data-message] h2').focus();
  await page.keyboard.press('e');
  await expectToast(page, 'Archived.');
  await expect(page.locator('[data-row]').filter({ hasText: 'Demo Agency' })).toHaveCount(0);
  // archiving moved on to the next (older) message
  await expect.poll(title).toBe('Backend engineer');
  // the first and last have nothing beyond them
  await page.locator('[data-row]').first().click();
  await expect.poll(title).toBe('Senior .NET role');
  await expect(page.getByRole('button', { name: 'Newer message' })).toBeDisabled();
});

test('AC-7.14 phones: list → message → back', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openInbox(page);
  await expect(page.locator('[data-inbox-list]')).toBeVisible();
  await expect(page.getByText('Pick a message to read it.')).toBeHidden();
  await page.locator('[data-row]').nth(2).click();
  await expect(page.locator('[data-message]')).toBeVisible();
  await expect(page.locator('[data-inbox-list]')).toBeHidden();
  await expect(page.locator('[data-message]')).toBeInViewport();
  await page.getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(page.locator('[data-inbox-list]')).toBeVisible();
  await expect(page.locator('[data-message]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await ctx.close();
});

test('AC-7.16 the clapper only animates when motion is allowed (reduced motion and Lite turn it off)', async ({
  page,
}) => {
  await openContact(page);
  await expect(form(page).locator('[data-contact-slate]')).toHaveAttribute('data-motion', 'true');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reloadContact(page);
  await expect(form(page).locator('[data-contact-slate]')).not.toHaveAttribute('data-motion');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.setItem('lite', '1'));
  await reloadContact(page);
  await expect(form(page).locator('[data-contact-slate]')).not.toHaveAttribute('data-motion');
});

/* ------------------------------------------------------------------ */
/* Screens (AC-7.16; the full sweep runs in public-screens / screens)   */
/* ------------------------------------------------------------------ */

for (const [width, height] of [
  [375, 812],
  [1440, 900],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`AC-7.16 contact and inbox at ${width}px, ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width, height },
        colorScheme: scheme,
        hasTouch: width < 600,
        isMobile: width < 600,
      });
      const page = await ctx.newPage();
      const errors = watchErrors(page);
      await openContact(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `tests/e2e/.results/contact/${width}-${scheme}-form.png` });
      await send(page).click();
      await page.screenshot({ path: `tests/e2e/.results/contact/${width}-${scheme}-errors.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      await openInbox(page);
      await page.locator('[data-row]').first().click();
      await page.locator('[data-message-body]').waitFor();
      await page.screenshot({ path: `tests/e2e/.results/contact/${width}-${scheme}-inbox.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}
