/** Admin logic that doesn't need a browser (spec 02). */
import { describe, expect, it } from 'vitest';
import { fieldDefinitions, type FieldDefinition } from '../../src/data/schemas';
import { droppedFiles, fileRefs } from '../../src/admin/data/files';
import { slugify } from '../../src/admin/fields/basic';
import { applyAction } from '../../src/admin/fields/MarkdownField';
import { flattenErrors } from '../../src/admin/managers/FormPage';
import { copySlug, toFormValues } from '../../src/admin/managers/types';
import { fitWithin, objectPathFor } from '../../src/admin/media/pipeline';
import { formatBytes, mapDbError } from '../../src/admin/repository/errors';
import { checkFileForBucket } from '../../src/admin/repository/limits';
import { nextPath } from '../../src/admin/auth/RequireOwner';
import { passwordProblem } from '../../src/admin/auth/screens';
import {
  emptyItemData,
  fieldChanges,
  hiddenData,
  keyFromLabel,
  sectionTemplates,
  uniqueKey,
} from '../../src/admin/sections/templates';
import { canonical } from '../../src/admin/shell/useIsDirty';

describe('error messages (§3.6)', () => {
  it('duplicate slug → plain message on the slug field', () => {
    const e = mapDbError(
      { code: '23505', message: 'duplicate key value violates unique constraint "projects_slug_key"' },
      'projects',
    );
    expect(e.kind).toBe('unique');
    expect(e.field).toBe('slug');
    expect(e.message).toBe('That web address is already used by another project.');
  });
  it('duplicate skill name', () => {
    const e = mapDbError(
      { code: '23505', message: 'violates unique constraint "skills_name_unique_ci"' },
      'skills',
    );
    expect(e.message).toBe('You already have a skill with that name.');
  });
  it('check constraint → field label', () => {
    const e = mapDbError(
      { code: '23514', message: 'violates check constraint "projects_title_check"' },
      'projects',
    );
    expect(e).toMatchObject({ kind: 'invalid', field: 'title', message: "Title isn't valid." });
    const n = mapDbError(
      { code: '23514', message: 'violates check constraint "experience_dates_ordered"' },
      'experience',
    );
    expect(n.field).toBe('end_date');
  });
  it('permission → session expired', () => {
    expect(mapDbError({ code: '42501' }, 'projects')).toMatchObject({ kind: 'auth' });
    expect(mapDbError({ code: 'PGRST301' }, 'projects').message).toMatch(/sign in again/);
  });
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(16 * 1024 * 1024)).toBe('16.0 MB');
  });
});

describe('bucket limits (AD-30, AD-33, AD-36)', () => {
  it('refuses wrong types and oversize files', () => {
    expect(() => checkFileForBucket('videos', 16 * 1024 * 1024, 'video/mp4')).toThrow('the limit is 15.0 MB');
    expect(() => checkFileForBucket('documents', 1000, 'image/png')).toThrow('Only PDF files');
    expect(() => checkFileForBucket('images', 1000, 'image/gif')).toThrow('JPEG, PNG, WebP, AVIF or SVG');
    expect(() => checkFileForBucket('images', 1000, 'image/webp')).not.toThrow();
  });
});

describe('image sizing (AC-2.14)', () => {
  it('fits within 2560 px without enlarging', () => {
    expect(fitWithin(6000, 4000)).toEqual({ width: 2560, height: 1707 });
    expect(fitWithin(4000, 6000)).toEqual({ width: 1707, height: 2560 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('stores files as <folder>/<uuid>.<ext>', () => {
    expect(objectPathFor('projects', 'image/webp')).toMatch(/^projects\/[0-9a-f-]{36}\.webp$/);
    expect(objectPathFor('Sections Talks!', 'application/pdf')).toMatch(
      /^sections-talks-\/[0-9a-f-]{36}\.pdf$/,
    );
  });
});

describe('file references (AD-14, AD-37, AD-38)', () => {
  const row = {
    cover: { path: 'images/projects/a.webp', alt: 'x' },
    gallery: [{ path: 'images/projects/b.webp', alt: 'y' }],
    video_mp4: 'videos/hero/c.mp4',
    resume_path: 'documents/settings/d.pdf',
    external: { path: 'https://cdn.example.com/e.webp', alt: 'z' },
    data: { photo: { path: 'images/talks/f.webp', alt: 'q' } },
    title: 'images are nice', // plain text that merely starts with a bucket word
  };
  it('finds every stored path, nested anywhere, and ignores external URLs and prose', () => {
    expect([...fileRefs(row)].sort()).toEqual([
      'documents/settings/d.pdf',
      'images/projects/a.webp',
      'images/projects/b.webp',
      'images/talks/f.webp',
      'videos/hero/c.mp4',
    ]);
  });
  it('lists files dropped by an edit', () => {
    const after = { ...row, cover: { path: 'images/projects/new.webp', alt: 'x' }, gallery: [] };
    expect(droppedFiles(row, after).sort()).toEqual(['images/projects/a.webp', 'images/projects/b.webp']);
  });
});

describe('slugs and keys (AD-15, AD-25, AD-51)', () => {
  it('slugify', () => {
    expect(slugify('Supply-chain EDI Pipeline!')).toBe('supply-chain-edi-pipeline');
    expect(slugify('  Café — Résumé  ')).toBe('cafe-resume');
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
  it('copySlug finds the next free copy name', () => {
    expect(copySlug('reel', [])).toBe('reel-copy');
    expect(copySlug('reel', ['reel-copy'])).toBe('reel-copy-2');
    expect(copySlug('reel-copy', ['reel-copy', 'reel-copy-2'])).toBe('reel-copy-3');
  });
  it('keyFromLabel and uniqueKey', () => {
    expect(keyFromLabel('Audience size')).toBe('audience_size');
    expect(keyFromLabel('2026 Edition')).toBe('edition');
    expect(keyFromLabel('!!!')).toBe('field');
    expect(uniqueKey('title', ['title', 'title_2'])).toBe('title_3');
  });
});

describe('section templates and field changes (AD-53, AD-54, AD-55)', () => {
  it('every template is valid', () => {
    for (const t of sectionTemplates) expect(fieldDefinitions.safeParse(t.fields).success, t.id).toBe(true);
  });
  const before: FieldDefinition[] = [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'venue', label: 'Venue', type: 'text', required: false },
    { key: 'year', label: 'Year', type: 'text', required: false },
  ];
  const items = [{ data: { title: 'A', venue: 'X', year: '2024' } }, { data: { title: 'B', venue: '' } }];
  it('reports removed fields and type changes that affect items', () => {
    const after: FieldDefinition[] = [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'number', required: false },
    ];
    expect(fieldChanges(before, after, items)).toEqual([
      { key: 'venue', label: 'Venue', itemsWithValues: 1, kind: 'removed' },
      { key: 'year', label: 'Year', itemsWithValues: 1, kind: 'type_changed' },
    ]);
    expect(fieldChanges(before, before, items)).toEqual([]);
  });
  it('hidden data = values for keys no field defines', () => {
    expect(hiddenData(before.slice(0, 1), { title: 'A', venue: 'X', empty: '' })).toEqual({ venue: 'X' });
  });
  it('empty item data per type', () => {
    expect(
      emptyItemData([
        { key: 't', label: 'T', type: 'text', required: true },
        { key: 'g', label: 'G', type: 'tags', required: false },
        { key: 'b', label: 'B', type: 'boolean', required: false },
        { key: 's', label: 'S', type: 'select', required: true, options: ['One', 'Two'] },
        { key: 'i', label: 'I', type: 'image', required: false },
      ]),
    ).toEqual({ t: '', g: [], b: false, s: 'One', i: null });
  });
});

describe('forms', () => {
  it('flattenErrors walks nested errors', () => {
    expect(
      flattenErrors({
        title: { type: 'too_small', message: 'Required' },
        cover: { alt: { type: 'custom', message: 'Required' } },
        gallery: [undefined, { alt: { type: 'custom', message: 'Required' } }],
      } as never),
    ).toEqual([
      { name: 'title', message: 'Required' },
      { name: 'cover.alt', message: 'Required' },
      { name: 'gallery.1.alt', message: 'Required' },
    ]);
  });
  it('canonical ignores key order and undefined values (unsaved-changes check)', () => {
    expect(canonical({ a: 1, links: { live: undefined }, b: [1] })).toBe(
      canonical({ b: [1], links: {}, a: 1 }),
    );
    expect(canonical({ a: null })).not.toBe(canonical({}));
  });
  it('toFormValues drops server-managed columns', () => {
    expect(toFormValues({ id: 'x', created_at: 't', updated_at: 't', title: 'A' } as never)).toEqual({
      title: 'A',
    });
  });
  it('markdown toolbar wraps the selection', () => {
    expect(
      applyAction('hello world', 6, 11, { label: 'B', title: 'Bold', apply: (s) => ({ text: `**${s}**` }) }),
    ).toEqual({
      value: 'hello **world**',
      cursor: 15,
    });
  });
});

describe('auth helpers', () => {
  it('passwordProblem (AC-2.6)', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 12 characters.');
    expect(passwordProblem('long-enough-pass', 'different-pass!!')).toBe("The two passwords don't match.");
    expect(passwordProblem('long-enough-pass', 'long-enough-pass')).toBeNull();
  });
  it('nextPath only returns to admin pages (AC-2.1)', () => {
    expect(nextPath({ next: '/admin/skills' })).toBe('/admin/skills');
    expect(nextPath({ next: 'https://evil.example.com' })).toBe('/admin');
    expect(nextPath({ next: '/admin/login/verify' })).toBe('/admin');
    expect(nextPath(null)).toBe('/admin');
  });
});

describe('authenticator setup key', async () => {
  const { groupKey } = await import('../../src/admin/auth/TotpEnrolment');
  it('groups the key in fours for typing', () => {
    expect(groupKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(groupKey('ABCDE')).toBe('ABCD E');
  });
});
