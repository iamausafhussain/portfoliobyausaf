/** Spec 07 task 7.10: send rules, form validation, draft, inbox filtering, reply links, email alert. */
import { describe, expect, it } from 'vitest';
import {
  countLinks,
  looksLikeBot,
  MIN_FILL_MS,
  sendErrorCode,
  sendErrorText,
  toInsert,
} from '../../src/data/contact';
import { messageInsert } from '../../src/data/schemas';
import {
  emptyDraft,
  firstError,
  isEmpty,
  kinds,
  LIMITS,
  mailtoFor,
  parseDraft,
  slateDate,
  validate,
  type Draft,
} from '../../src/chapters/contact/formRules';
import {
  neighbours,
  preview,
  readFilters,
  replyMailto,
  shortcutFor,
  timeAgo,
  writeFilters,
} from '../../src/admin/inbox/inbox';
import {
  cleanSearch,
  countTabs,
  filterMessages,
  matchesQuery,
  searchFilter,
} from '../../src/admin/repository/messages';
import type { MessageRow } from '../../src/admin/repository/types';
import { demoMessages } from '../../src/admin/repository/demoSeed';
import { createDemoRepository } from '../../src/admin/repository/demoRepository';
import {
  alertEmail,
  messageFromPayload,
  sameSecret,
  type MessageRecord,
} from '../../supabase/functions/notify-message/format';

const draft = (patch: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  name: 'Asha',
  email: 'asha@example.com',
  body: 'Hello, I have a project for you.',
  ...patch,
});

describe('sending (SP-1, SP-2, CT-7)', () => {
  it('maps database and network errors to friendly codes', () => {
    expect(sendErrorCode({ message: 'rate_limited', code: 'PT429' })).toBe('rate_limited');
    expect(sendErrorCode({ message: 'whatever', status: 429 })).toBe('rate_limited');
    expect(sendErrorCode({ message: 'too_many_links', code: 'PT422' })).toBe('too_many_links');
    expect(sendErrorCode({ message: 'new row violates check constraint', code: '23514' })).toBe('invalid');
    expect(sendErrorCode({ message: 'TypeError: Failed to fetch', code: '' })).toBe('offline');
    expect(sendErrorCode({ message: 'Load failed' })).toBe('offline');
    expect(sendErrorCode({ message: 'permission denied', code: '42501' })).toBe('server');
    expect(sendErrorCode(null)).toBe('server');
    for (const text of Object.values(sendErrorText)) expect(text.length).toBeGreaterThan(20);
  });

  it('treats a filled honeypot or a too-fast send as a bot', () => {
    expect(looksLikeBot('', 0, MIN_FILL_MS + 1)).toBe(false);
    expect(looksLikeBot('', 0, MIN_FILL_MS - 1)).toBe(true);
    expect(looksLikeBot('http://spam', 0, 60_000)).toBe(true);
    expect(looksLikeBot('   ', 0, 60_000)).toBe(false);
  });

  it('counts links the way the database does', () => {
    expect(countLinks('see https://a.io and http://b.io and www.c.io')).toBe(3);
    expect(countLinks('HTTPS://A.IO WWW.B.IO')).toBe(2);
    expect(countLinks('no links here, just example.com')).toBe(0);
  });

  it('sends only the allowed columns, budget only for freelance (AC-7.3)', () => {
    expect(
      toInsert({
        kind: 'freelance',
        name: ' A ',
        email: ' a@b.co ',
        subject: ' S ',
        body: ' Long enough body ',
        budget: ' 50k ',
      }),
    ).toEqual({
      kind: 'freelance',
      name: 'A',
      email: 'a@b.co',
      subject: 'S',
      body: 'Long enough body',
      budget: '50k',
    });
    expect(
      toInsert({
        kind: 'hire',
        name: 'A',
        email: 'a@b.co',
        subject: '',
        body: 'Long enough body',
        budget: '50k',
      }).budget,
    ).toBeNull();
    expect(
      toInsert({
        kind: 'freelance',
        name: 'A',
        email: 'a@b.co',
        subject: '',
        body: 'Long enough body',
        budget: '  ',
      }).budget,
    ).toBeNull();
  });
});

describe('the form (CT-2 – CT-5)', () => {
  it('offers the four choices in order, "Just saying hi" by default', () => {
    expect(kinds.map((k) => k.label)).toEqual([
      'Hiring',
      'Freelance project',
      'Collaboration',
      'Just saying hi',
    ]);
    expect(emptyDraft().kind).toBe('general');
  });

  it('checks every field with the database limits', () => {
    expect(validate(draft())).toEqual({});
    const e = validate(emptyDraft());
    expect(Object.keys(e)).toEqual(['name', 'email', 'body']);
    expect(firstError(e)).toBe('name');
    expect(validate(draft({ email: 'not-an-email' })).email).toMatch(/valid email/);
    expect(validate(draft({ body: 'too short' })).body).toMatch(/at least 10/);
    expect(validate(draft({ body: 'x'.repeat(LIMITS.body + 1) })).body).toMatch(/5,000/);
    expect(validate(draft({ name: 'x'.repeat(81) })).name).toMatch(/80/);
    expect(validate(draft({ subject: 'x'.repeat(151) })).subject).toMatch(/150/);
    // budget only counts for freelance
    expect(validate(draft({ kind: 'hire', budget: 'x'.repeat(100) }))).toEqual({});
    expect(validate(draft({ kind: 'freelance', budget: 'x'.repeat(61) })).budget).toMatch(/60/);
    expect(firstError(validate(draft({ email: '', body: '' })))).toBe('email');
  });

  it('agrees with the shared schema: a valid form is a valid insert', () => {
    for (const d of [
      draft(),
      draft({ kind: 'freelance', budget: '₹1L', subject: 'Hi' }),
      draft({ kind: 'collab' }),
    ]) {
      expect(validate(d)).toEqual({});
      expect(messageInsert.safeParse(toInsert(d)).success).toBe(true);
    }
  });

  it('builds a pre-filled email for when sending fails', () => {
    const href = mailtoFor('me@site.dev', draft({ kind: 'freelance', budget: '50k', subject: '' }));
    expect(href.startsWith('mailto:me@site.dev?subject=')).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get('subject')).toBe('Freelance project — from Asha');
    expect(url.searchParams.get('body')).toBe('Hello, I have a project for you.\n\nBudget: 50k\n\n— Asha');
  });

  it('dates the slate', () => {
    expect(slateDate(new Date(Date.UTC(2026, 9, 17, 12)))).toBe('17 OCT 2026');
  });

  it('keeps a draft safely (CT-8)', () => {
    expect(parseDraft(JSON.stringify(draft({ kind: 'collab' })))).toEqual(draft({ kind: 'collab' }));
    expect(parseDraft(JSON.stringify({ kind: 'evil', name: 5, body: 'hi' }))).toEqual({
      ...emptyDraft(),
      body: 'hi',
    });
    expect(parseDraft('{not json')).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(isEmpty(emptyDraft())).toBe(true);
    expect(isEmpty(draft())).toBe(false);
  });
});

describe('inbox (IB-2 – IB-7)', () => {
  const all = demoMessages();

  it('filters by tab, kind and search, newest first', () => {
    const counts = countTabs(all);
    expect(counts).toEqual({ new: 3, read: 2, replied: 2, archived: 2, all: 7 });
    const { rows, total } = filterMessages(all, { tab: 'all', limit: 3 });
    expect(total).toBe(7);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.created_at)).toEqual([...rows.map((r) => r.created_at)].sort().reverse());
    expect(
      filterMessages(all, { tab: 'archived', limit: 50 }).rows.every((r) => r.status === 'archived'),
    ).toBe(true);
    expect(filterMessages(all, { tab: 'all', limit: 50 }).rows.some((r) => r.status === 'archived')).toBe(
      false,
    );
    expect(filterMessages(all, { tab: 'all', kind: 'freelance', limit: 50 }).rows.map((r) => r.name)).toEqual(
      ['Demo Founder', 'Demo Agency'],
    );
    const m = all[0]!;
    expect(matchesQuery(m, { tab: 'all', search: 'RECRUITER@' })).toBe(true);
    expect(matchesQuery(m, { tab: 'all', search: 'service bus' })).toBe(true);
    expect(matchesQuery(m, { tab: 'all', search: 'nothing like this' })).toBe(false);
  });

  it('cleans search text for the database filter', () => {
    expect(cleanSearch('  a,b(c)*%"d\\ ')).toBe('a b c d');
    expect(searchFilter('')).toBeNull();
    expect(searchFilter('  ')).toBeNull();
    expect(searchFilter('gmail.com')).toBe(
      'name.ilike."*gmail.com*",email.ilike."*gmail.com*",subject.ilike."*gmail.com*",body.ilike."*gmail.com*"',
    );
    expect(searchFilter('x),status.eq.new')).not.toMatch(/[()]/);
  });

  it('finds the newer and older message', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(neighbours(rows, 'b')).toEqual({ index: 1, newer: 'a', older: 'c' });
    expect(neighbours(rows, 'a')).toEqual({ index: 0, newer: null, older: 'b' });
    expect(neighbours(rows, 'c')).toEqual({ index: 2, newer: 'b', older: null });
    expect(neighbours(rows, 'zzz')).toEqual({ index: -1, newer: null, older: null });
  });

  it('writes a reply with "Re:" and the quoted message (AC-7.13)', () => {
    const m = { ...all[0]!, body: 'Line one\nLine two' } as MessageRow;
    const url = new URL(replyMailto(m, 'en-GB'));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('recruiter@example.com');
    expect(url.searchParams.get('subject')).toBe('Re: Senior .NET role');
    const body = url.searchParams.get('body')!;
    expect(body.startsWith('Hi Demo,')).toBe(true);
    expect(body).toContain('Demo Recruiter wrote:\n> Line one\n> Line two');
    const noSubject = new URL(replyMailto({ ...m, subject: '' }));
    expect(noSubject.searchParams.get('subject')).toBe('Re: Hiring');
  });

  it('shows short times and previews', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(timeAgo('2026-10-17T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-17T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-10-17T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-15T12:00:00Z', now)).toBe('2 d ago');
    expect(timeAgo('2026-09-01T12:00:00Z', now, 'en-GB')).toBe('1 Sept');
    expect(timeAgo('2025-09-01T12:00:00Z', now, 'en-GB')).toBe('1 Sept 2025');
    expect(preview({ subject: '', body: 'Hello\n\nthere' })).toBe('Hello there');
    expect(preview({ subject: 'Subject wins', body: 'x' })).toBe('Subject wins');
    expect(preview({ subject: '', body: 'x'.repeat(200) }, 20)).toHaveLength(20);
  });

  it('keeps filters in the address', () => {
    expect(readFilters(new URLSearchParams('tab=new&kind=hire&q=bob'))).toEqual({
      tab: 'new',
      kind: 'hire',
      q: 'bob',
    });
    expect(readFilters(new URLSearchParams('tab=nope&kind=evil'))).toEqual({ tab: 'all', kind: null, q: '' });
    expect(writeFilters({ tab: 'all', kind: null, q: '' })).toBe('');
    expect(writeFilters({ tab: 'archived', kind: 'collab', q: ' x ' })).toBe('?tab=archived&kind=collab&q=x');
  });

  it('reads the j / k / e shortcuts, not while typing', () => {
    expect(shortcutFor({ key: 'j' })).toBe('older');
    expect(shortcutFor({ key: 'k' })).toBe('newer');
    expect(shortcutFor({ key: 'e' })).toBe('archive');
    expect(shortcutFor({ key: 'x' })).toBeNull();
    expect(shortcutFor({ key: 'j', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: 'j', target: { tagName: 'INPUT' } as unknown as EventTarget })).toBeNull();
    expect(shortcutFor({ key: 'e', target: { tagName: 'TEXTAREA' } as unknown as EventTarget })).toBeNull();
  });
});

describe('demo backend applies the database rules (SP-3, SP-5)', () => {
  const send = (
    repo: ReturnType<typeof createDemoRepository>,
    email: string,
    body = 'A message long enough.',
  ) => repo.publicSource.sendMessage({ name: 'V', email, body, kind: 'general' });

  it('limits a visitor to 3 messages in 10 minutes', async () => {
    const repo = createDemoRepository();
    await send(repo, 'a@example.com');
    await send(repo, 'b@example.com');
    await send(repo, 'c@example.com');
    await expect(send(repo, 'd@example.com')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('refuses more than 5 links and stores emails lower-case', async () => {
    const repo = createDemoRepository();
    const six = Array.from({ length: 6 }, (_, i) => `https://x.io/${i}`).join(' ');
    await expect(send(repo, 'a@example.com', six)).rejects.toMatchObject({ code: 'too_many_links' });
    await send(repo, 'Mixed@Example.COM');
    await repo.auth.signIn('demo@example.com', 'x');
    const setup = await repo.auth.startTotpSetup();
    await repo.auth.finishTotpSetup(setup.factorId, '000000');
    const { rows } = await repo.messages.list({ tab: 'new', limit: 50 });
    expect(rows[0]!.email).toBe('mixed@example.com');
    expect(rows[0]!.status).toBe('new');
  });

  it('refuses invalid messages', async () => {
    const repo = createDemoRepository();
    await expect(send(repo, 'not-an-email')).rejects.toMatchObject({ code: 'invalid' });
    await expect(send(repo, 'a@example.com', 'short')).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('email alert (NT-1)', () => {
  const record: MessageRecord = {
    id: 'm1',
    name: 'Asha <script>',
    email: 'asha@example.com',
    kind: 'freelance',
    subject: 'Line\nbreak',
    body: 'Hi <b>there</b>\nSecond line',
    budget: '50k',
    created_at: '2026-10-17T10:00:00Z',
  };

  it('reads only INSERTs into public.messages', () => {
    expect(messageFromPayload({ type: 'INSERT', schema: 'public', table: 'messages', record })).toEqual(
      record,
    );
    expect(messageFromPayload({ type: 'UPDATE', table: 'messages', record })).toBeNull();
    expect(messageFromPayload({ type: 'INSERT', table: 'projects', record })).toBeNull();
    expect(messageFromPayload({ type: 'INSERT', table: 'messages', record: { id: 1 } })).toBeNull();
    expect(messageFromPayload('nope')).toBeNull();
    expect(
      messageFromPayload({ type: 'INSERT', table: 'messages', record: { ...record, kind: 'weird' } })?.kind,
    ).toBe('general');
  });

  it('writes a safe email with Reply-To set to the visitor', () => {
    const e = alertEmail(record, 'https://site.dev/');
    expect(e.replyTo).toBe('asha@example.com');
    expect(e.subject).toBe('New message: Freelance project from Asha <script>');
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.text).toContain('Subject: Line break');
    expect(e.text).toContain('Budget: 50k');
    expect(e.text).toContain('https://site.dev/admin/inbox/m1');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(e.html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
  });

  it('compares the webhook secret safely', () => {
    expect(sameSecret('abc123', 'abc123')).toBe(true);
    expect(sameSecret('abc123', 'abc124')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });
});
