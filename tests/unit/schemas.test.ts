/** AC-1.22, AC-1.23 — Zod schemas mirror the database rules; buildItemSchema enforces field definitions. */
import { describe, expect, it } from 'vitest';
import {
  achievementRow,
  buildItemSchema,
  customSectionInsert,
  experienceInsert,
  fieldDefinition,
  fieldDefinitions,
  heroMediaInsert,
  imageRef,
  itemTitle,
  messageInsert,
  projectInsert,
  projectRow,
  siteSettingsRow,
  skillRow,
  testimonialRow,
  type FieldDefinition,
} from '../../src/data/schemas';

const ts = '2026-10-14T04:01:00.123456+00:00';
const base = {
  id: '00000000-0000-4000-8000-000000000201',
  sort_order: 0,
  is_published: true,
  created_at: ts,
  updated_at: ts,
};

describe('row schemas accept what the database returns', () => {
  it('site_settings (default row)', () => {
    expect(
      siteSettingsRow.safeParse({
        id: 1,
        display_name: 'Ausaf Hussain',
        tagline: '',
        bio_short: '',
        bio_long: '',
        portrait: null,
        location: '',
        public_email: null,
        resume_path: null,
        socials: {},
        available_for_work: true,
        hero_playback: 'single',
        seo: {},
        updated_at: ts,
      }).success,
    ).toBe(true);
  });

  it('project (seed row)', () => {
    const r = projectRow.safeParse({
      ...base,
      slug: 'placeholder-project',
      title: '[Placeholder] Supply-chain data pipeline',
      summary: 'Replace this with a one-line summary of a real project.',
      body: 'Write the full case study here in **Markdown**.',
      category: 'work',
      role: 'Backend developer',
      client: null,
      year: 2026,
      cover: null,
      gallery: [],
      tech: ['C#', '.NET', 'Azure'],
      links: { repo: 'https://github.com/iamausafhussain' },
      is_featured: true,
      globe: null,
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('achievement, skill, testimonial', () => {
    expect(
      achievementRow.safeParse({
        ...base,
        title: 'AZ-204',
        kind: 'certification',
        issuer: 'Microsoft',
        awarded_on: '2026-01-01',
        description: '',
        image: null,
        link: null,
        is_highlighted: false,
      }).success,
    ).toBe(true);
    expect(
      skillRow.safeParse({
        ...base,
        name: 'C#',
        category: 'Backend',
        level: 5,
        icon: null,
        is_featured: true,
      }).success,
    ).toBe(true);
    expect(
      testimonialRow.safeParse({
        ...base,
        quote: 'Great work.',
        author_name: 'Client',
        author_role: '',
        author_company: '',
        avatar: null,
        rating: 5,
        source_url: null,
        project_id: null,
      }).success,
    ).toBe(true);
  });
});

describe('schemas reject what the database rejects', () => {
  it('slugs', () => {
    for (const slug of ['My Project', 'a--b', '-a', 'a-', 'UPPER']) {
      expect(projectInsert.safeParse({ slug, title: 'X', summary: 'X' }).success, slug).toBe(false);
    }
    expect(projectInsert.safeParse({ slug: 'edi-pipeline-2', title: 'X', summary: 'X' }).success).toBe(true);
  });

  it('length limits and blank text', () => {
    expect(projectInsert.safeParse({ slug: 'a', title: 'x'.repeat(101), summary: 'X' }).success).toBe(false);
    expect(projectInsert.safeParse({ slug: 'a', title: '   ', summary: 'X' }).success).toBe(false);
    expect(
      projectInsert.safeParse({ slug: 'a', title: 'X', summary: 'X', tech: Array(21).fill('t') }).success,
    ).toBe(false);
  });

  it('image references need alt text and a safe path (AC-1.6)', () => {
    expect(imageRef.safeParse({ path: 'images/x.webp' }).success).toBe(false);
    expect(imageRef.safeParse({ path: 'images/x.webp', alt: '  ' }).success).toBe(false);
    expect(imageRef.safeParse({ path: '../etc/passwd', alt: 'x' }).success).toBe(false);
    expect(imageRef.safeParse({ path: 'images/x.webp', alt: 'x', onload: 'evil' }).success).toBe(false);
    expect(
      imageRef.safeParse({ path: 'images/x.webp', alt: 'Screenshot', width: 1600, height: 900 }).success,
    ).toBe(true);
    expect(imageRef.safeParse({ path: 'https://cdn.example.com/x.webp', alt: 'Screenshot' }).success).toBe(
      true,
    );
  });

  it('experience end date after start (AC-1.7)', () => {
    expect(
      experienceInsert.safeParse({
        company: 'X',
        role: 'X',
        start_date: '2024-05-01',
        end_date: '2024-04-30',
      }).success,
    ).toBe(false);
    expect(
      experienceInsert.safeParse({ company: 'X', role: 'X', start_date: '2024-05-01', end_date: null })
        .success,
    ).toBe(true);
  });

  it('hero sources match their type (HM-2)', () => {
    const poster = { path: 'images/p.webp', alt: 'Poster' };
    expect(
      heroMediaInsert.safeParse({ title: 'X', source_type: 'url', video_mp4: 'videos/a.mp4', poster })
        .success,
    ).toBe(false);
    expect(
      heroMediaInsert.safeParse({
        title: 'X',
        source_type: 'upload',
        video_mp4: 'https://x.example.com/a.mp4',
        poster,
      }).success,
    ).toBe(false);
    expect(
      heroMediaInsert.safeParse({
        title: 'X',
        source_type: 'url',
        video_mp4: 'http://x.example.com/a.mp4',
        poster,
      }).success,
    ).toBe(false);
    expect(
      heroMediaInsert.safeParse({ title: 'X', source_type: 'upload', video_mp4: 'videos/hero/a.mp4', poster })
        .success,
    ).toBe(true);
  });

  it('social links must be https and known networks', () => {
    const row = siteSettingsRow.shape.socials;
    expect(row.safeParse({ github: 'javascript:alert(1)' }).success).toBe(false);
    expect(row.safeParse({ myspace: 'https://myspace.com/x' }).success).toBe(false);
    expect(row.safeParse({ github: 'https://github.com/iamausafhussain', x: null }).success).toBe(true);
  });

  it('messages: only visitor-sendable columns, valid email, body ≥ 10 chars', () => {
    expect(
      messageInsert.safeParse({ name: 'V', email: 'v@example.com', body: 'Hello, I would like to hire you.' })
        .success,
    ).toBe(true);
    expect(
      messageInsert.safeParse({ name: 'V', email: 'bad', body: 'Hello, I would like to hire you.' }).success,
    ).toBe(false);
    expect(messageInsert.safeParse({ name: 'V', email: 'v@example.com', body: 'too short' }).success).toBe(
      false,
    );
    const parsed = messageInsert.parse({
      name: 'V',
      email: 'v@example.com',
      body: 'Hello, I would like to hire you.',
      status: 'read',
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('custom section field definitions (DM-7)', () => {
  const ok = (f: object) => fieldDefinition.safeParse(f).success;

  it('validates keys, types, options and help', () => {
    expect(ok({ key: 'venue', label: 'Venue', type: 'text', required: true })).toBe(true);
    expect(ok({ key: 'Bad Key', label: 'A', type: 'text', required: true })).toBe(false);
    expect(ok({ key: '1abc', label: 'A', type: 'text', required: true })).toBe(false);
    expect(ok({ key: 'a', label: 'A', type: 'colour', required: true })).toBe(false);
    expect(ok({ key: 'a', label: 'A', type: 'text' })).toBe(false);
    expect(ok({ key: 'a', label: 'A', type: 'select', required: true })).toBe(false);
    expect(ok({ key: 'a', label: 'A', type: 'select', required: true, options: ['x', 'x'] })).toBe(false);
    expect(ok({ key: 'a', label: 'A', type: 'text', required: true, options: ['x'] })).toBe(false);
    expect(
      ok({ key: 'a', label: 'A', type: 'select', required: false, options: ['One', 'Two'], help: 'Pick' }),
    ).toBe(true);
  });

  it('a section needs 1–15 fields with unique keys', () => {
    const f = { key: 'a', label: 'A', type: 'text', required: true };
    expect(fieldDefinitions.safeParse([]).success).toBe(false);
    expect(fieldDefinitions.safeParse([f, f]).success).toBe(false);
    expect(
      fieldDefinitions.safeParse(Array.from({ length: 16 }, (_, i) => ({ ...f, key: `k${i}` }))).success,
    ).toBe(false);
  });

  it('reserved slugs and "after contact" are rejected', () => {
    const fields = [{ key: 'a', label: 'A', type: 'text', required: true }];
    expect(customSectionInsert.safeParse({ name: 'X', slug: 'admin', fields }).success).toBe(false);
    expect(
      customSectionInsert.safeParse({ name: 'X', slug: 'talks', fields, insert_after: 'contact' }).success,
    ).toBe(false);
    expect(customSectionInsert.safeParse({ name: 'X', slug: 'talks', fields }).success).toBe(true);
  });
});

describe('buildItemSchema (AC-1.23)', () => {
  const fields: FieldDefinition[] = [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'summary', label: 'Summary', type: 'long_text', required: false },
    { key: 'notes', label: 'Notes', type: 'markdown', required: false },
    { key: 'attendees', label: 'Attendees', type: 'number', required: false },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'link', label: 'Link', type: 'url', required: false },
    { key: 'photo', label: 'Photo', type: 'image', required: false },
    { key: 'topics', label: 'Topics', type: 'tags', required: false },
    { key: 'keynote', label: 'Keynote', type: 'boolean', required: false },
    { key: 'format', label: 'Format', type: 'select', required: true, options: ['Talk', 'Workshop'] },
  ];
  const schema = buildItemSchema(fields);
  const valid = { title: 'Scaling EDI', date: '2026-03-01', format: 'Talk' };
  const check = (patch: Record<string, unknown>) => schema.safeParse({ ...valid, ...patch }).success;

  it('accepts a minimal valid item', () => expect(schema.safeParse(valid).success).toBe(true));

  it('enforces required fields', () => {
    expect(schema.safeParse({ date: '2026-03-01', format: 'Talk' }).success).toBe(false);
    expect(check({ title: '   ' })).toBe(false);
    expect(check({ date: undefined })).toBe(false);
  });

  it('optional fields accept missing, null and empty text', () => {
    expect(check({ summary: '', notes: null, link: null, attendees: undefined })).toBe(true);
  });

  it('enforces each field type', () => {
    expect(check({ attendees: '40' })).toBe(false);
    expect(check({ attendees: 40 })).toBe(true);
    expect(check({ date: '01/03/2026' })).toBe(false);
    expect(check({ link: 'http://example.com' })).toBe(false);
    expect(check({ link: 'https://example.com/talk' })).toBe(true);
    expect(check({ photo: { path: 'images/x.webp' } })).toBe(false);
    expect(check({ photo: { path: 'images/x.webp', alt: 'Me on stage' } })).toBe(true);
    expect(check({ topics: 'azure' })).toBe(false);
    expect(check({ topics: ['azure', '.net'] })).toBe(true);
    expect(check({ topics: Array(21).fill('t') })).toBe(false);
    expect(check({ keynote: 'yes' })).toBe(false);
    expect(check({ keynote: true })).toBe(true);
    expect(check({ title: 'x'.repeat(201) })).toBe(false);
  });

  it('select values must be one of the options', () => {
    expect(check({ format: 'Podcast' })).toBe(false);
    expect(check({ format: 'Workshop' })).toBe(true);
  });

  it('keeps values for fields that are no longer defined', () => {
    const parsed = schema.parse({ ...valid, old_field: 'kept' });
    expect(parsed).toHaveProperty('old_field', 'kept');
  });

  it('rejects items over 50 KB', () => {
    expect(check({ notes: 'x'.repeat(9000), summary: 'x'.repeat(2000), extra: 'x'.repeat(45000) })).toBe(
      false,
    );
  });

  it('itemTitle uses the first text field, else "Item N"', () => {
    expect(itemTitle(fields, valid, 0)).toBe('Scaling EDI');
    expect(itemTitle(fields, { title: '' }, 2)).toBe('Item 3');
    expect(itemTitle([{ key: 'n', label: 'N', type: 'number', required: true }], { n: 1 }, 0)).toBe('Item 1');
  });
});
