/** Spec 06 task 6.9: dates, readouts, timeline layout, custom item mapping, skills, bio, credits. */
import { describe, expect, it } from 'vitest';
import { plainParagraphs } from '../../src/components/markdown/plainText';
import { bioLines } from '../../src/chapters/about/AboutChapter';
import { creditGroups } from '../../src/chapters/credits/CreditsChapter';
import { byDateDesc, itemView } from '../../src/chapters/custom/itemView';
import { CAROUSEL_FROM } from '../../src/chapters/reviews/ReviewsChapter';
import {
  formatDuration,
  formatMonth,
  formatRange,
  labelForYearFraction,
  monthsBetween,
  todayIso,
  yearFraction,
} from '../../src/chapters/shared/dates';
import { readouts, yearsSince } from '../../src/chapters/shared/readouts';
import { layoutTimeline, MIN_SPAN, pct, playheadTime } from '../../src/chapters/timeline/layout';
import { skillTracks } from '../../src/chapters/timeline/TimelineChapter';
import type { FieldDefinition, Skill } from '../../src/data/schemas';
import { Enums } from '../../src/data/schemas/common';

describe('dates', () => {
  it('formats months and ranges in UTC', () => {
    expect(formatMonth('2023-07-01', 'en-US')).toBe('Jul 2023');
    expect(formatMonth('2024-01-31', 'en-US')).toBe('Jan 2024');
    expect(formatRange('2023-07-01', null, 'en-US')).toBe('Jul 2023 – Present');
    expect(formatRange('2024-02-01', '2025-03-01', 'en-US')).toBe('Feb 2024 – Mar 2025');
  });

  it('counts months inclusively, never below one', () => {
    expect(monthsBetween('2024-01-01', '2024-01-20')).toBe(1);
    expect(monthsBetween('2024-01-01', '2024-12-01')).toBe(12);
    expect(monthsBetween('2022-12-01', '2023-05-01')).toBe(6);
    expect(monthsBetween('2025-05-01', '2024-01-01')).toBe(1);
  });

  it('formats durations, open roles counting to today', () => {
    expect(formatDuration('2022-12-01', '2023-05-01')).toBe('6m');
    expect(formatDuration('2024-02-01', '2025-03-01')).toBe('1y 2m');
    expect(formatDuration('2024-01-01', '2024-12-01')).toBe('1y');
    expect(formatDuration('2023-07-01', null, '2026-10-14')).toBe('3y 4m');
  });

  it('turns dates into fractional years and back into labels', () => {
    expect(yearFraction('2023-01-01')).toBe(2023);
    expect(yearFraction('2023-07-01')).toBeCloseTo(2023.5);
    expect(labelForYearFraction(2023.5, 'en-US')).toBe('Jul 2023');
    expect(labelForYearFraction(2024.999, 'en-US')).toBe('Dec 2024');
    expect(todayIso(new Date(Date.UTC(2026, 9, 14, 23)))).toBe('2026-10-14');
  });
});

describe('readouts (AB-3)', () => {
  it('counts whole years since the earliest start, with a "+" for more', () => {
    expect(yearsSince([], '2026-10-14')).toEqual({ years: 0, more: false });
    expect(yearsSince(['2023-07-01', '2022-12-01'], '2026-10-14')).toEqual({ years: 3, more: true });
    expect(yearsSince(['2023-10-01'], '2026-10-14')).toEqual({ years: 3, more: false });
  });

  it('works the numbers out from the data and leaves out zeros', () => {
    const r = readouts(
      {
        experience: [
          { start_date: '2022-12-01' },
          { start_date: '2023-07-01' },
          { start_date: '2024-02-01' },
        ],
        projects: [1, 2, 3, 4],
        achievements: [
          { kind: 'certification' },
          { kind: 'award' },
          { kind: 'recognition' },
          { kind: 'title' },
        ],
      },
      '2026-10-14',
    );
    expect(r.map((x) => [x.key, x.value, x.suffix, x.label])).toEqual([
      ['years', 3, '+', 'years building'],
      ['roles', 3, '', 'roles'],
      ['projects', 4, '', 'projects shipped'],
      ['certifications', 1, '', 'certification'],
      ['awards', 2, '', 'awards'],
    ]);
    expect(readouts({ experience: [], projects: [], achievements: [] })).toEqual([]);
    expect(
      readouts({ experience: [], projects: [1], achievements: [] }).map((x) => [x.key, x.label]),
    ).toEqual([['projects', 'project shipped']]);
  });
});

describe('timeline layout (TL-1, TL-2)', () => {
  const today = '2026-10-14';
  const roles = [
    { id: 'job', start_date: '2023-07-01', end_date: null },
    { id: 'freelance', start_date: '2024-02-01', end_date: '2025-03-01' },
    { id: 'intern', start_date: '2022-12-01', end_date: '2023-05-01' },
  ];

  it('packs overlapping roles onto separate tracks and runs open roles to today', () => {
    const l = layoutTimeline(roles, today);
    const byId = Object.fromEntries(l.clips.map((c) => [c.id, c]));
    expect(byId.intern!.track).toBe(0);
    expect(byId.job!.track).toBe(0); // starts after the internship ended
    expect(byId.freelance!.track).toBe(1); // overlaps the job
    expect(l.tracks).toBe(2);
    expect(byId.job!.end).toBeCloseTo(yearFraction(today));
    expect(byId.freelance!.end).toBeCloseTo(yearFraction('2025-03-01') + 1 / 12);
    expect(l.from).toBe(2022);
    expect(l.years).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it('keeps a minimum span and copes with no roles', () => {
    const one = layoutTimeline([{ id: 'a', start_date: '2026-06-01', end_date: null }], today);
    expect(one.to - one.from).toBeGreaterThanOrEqual(MIN_SPAN);
    expect(one.tracks).toBe(1);
    const none = layoutTimeline([], today);
    expect(none.clips).toEqual([]);
    expect(none.tracks).toBe(0);
  });

  it('places things on the ruler and moves the playhead back through a role', () => {
    expect(pct(2024, 2022, 2026)).toBe(50);
    const clip = { start: 2023, end: 2025 };
    expect(playheadTime(clip, 0)).toBe(2025);
    expect(playheadTime(clip, 0.5)).toBe(2024);
    expect(playheadTime(clip, 1)).toBe(2023);
    expect(playheadTime(clip, 7)).toBe(2023);
    expect(playheadTime(clip, -1)).toBe(2025);
  });
});

describe('custom item mapping (CS-2)', () => {
  const f = (key: string, type: FieldDefinition['type'], label = key): FieldDefinition => ({
    key,
    label,
    type,
    required: false,
    ...(type === 'select' ? { options: ['Talk', 'Workshop'] } : {}),
  });
  const fields = [
    f('title', 'text'),
    f('venue', 'text'),
    f('when', 'date'),
    f('photo', 'image'),
    f('notes', 'markdown'),
    f('kind', 'select'),
    f('topics', 'tags'),
    f('audience', 'number', 'Audience'),
    f('online', 'boolean', 'Online'),
    f('slides', 'url', 'Slides'),
    f('video', 'url', 'Video'),
  ];

  it('maps fields onto title, subtitle, image, date, body, links and tags', () => {
    const v = itemView(
      fields,
      {
        title: 'Scaling EDI',
        venue: 'Meetup',
        when: '2026-05-10',
        photo: { path: 'a.webp', alt: 'Stage' },
        notes: '**Hi**',
        kind: 'Talk',
        topics: ['Azure', 'EDI'],
        audience: 80,
        online: true,
        slides: 'https://example.com/s',
        video: '',
      },
      0,
    );
    expect(v).toEqual({
      title: 'Scaling EDI',
      subtitle: 'Meetup',
      image: { path: 'a.webp', alt: 'Stage' },
      date: '2026-05-10',
      body: '**Hi**',
      links: [{ label: 'Slides', url: 'https://example.com/s' }],
      tags: ['Talk', 'Azure', 'EDI', 'Audience: 80', 'Online'],
    });
  });

  it('falls back to "Item n" and skips empty or malformed values', () => {
    const v = itemView(fields, { title: '  ', photo: { path: 'x' }, online: false, topics: 'nope' }, 2);
    expect(v.title).toBe('Item 3');
    expect(v.image).toBeNull();
    expect(v.tags).toEqual([]);
    expect(v.subtitle).toBeNull();
  });

  it('sorts newest first with undated items last', () => {
    const mk = (id: string, date: string | null) => ({ id, view: { ...itemView([], {}, 0), date } });
    expect(byDateDesc([mk('a', '2024-01-01'), mk('b', null), mk('c', '2026')]).map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});

describe('skills, bio and credits', () => {
  it('groups skills by category in order, featured first (TL-4)', () => {
    const s = (id: string, category: string, is_featured = false) =>
      ({ id, name: id, category, is_featured, level: 3 }) as unknown as Skill;
    const t = skillTracks([
      s('C#', 'Backend'),
      s('React', 'Frontend'),
      s('.NET', 'Backend', true),
      s('SQL', 'Backend'),
    ]);
    expect(t.map((x) => [x.category, x.skills.map((k) => k.name)])).toEqual([
      ['Backend', ['.NET', 'C#', 'SQL']],
      ['Frontend', ['React']],
    ]);
    expect(skillTracks([])).toEqual([]);
  });

  it('splits the short bio into sentences (AB-2)', () => {
    expect(bioLines('I build pipelines. I shoot films! Why? Because')).toEqual([
      'I build pipelines.',
      'I shoot films!',
      'Why?',
      'Because',
    ]);
    expect(bioLines('He said "hi." Then left.')).toEqual(['He said "hi."', 'Then left.']);
    expect(bioLines('')).toEqual([]);
  });

  it('rolls credits in a fixed order covering every kind (CR-2)', () => {
    expect(creditGroups.map((g) => g.kind)).toEqual([
      'award',
      'certification',
      'title',
      'recognition',
      'publication',
      'other',
    ]);
    expect([...creditGroups.map((g) => g.kind)].sort()).toEqual([...Enums.achievement_kind].sort());
    expect(CAROUSEL_FROM).toBe(3);
  });
});

describe('markdown fallback', () => {
  it('shows plain paragraphs while the renderer loads', () => {
    expect(plainParagraphs('Demo **bold** and [a link](https://x.y).\n\n## Next\npara  two')).toEqual([
      'Demo bold and a link.',
      'Next para two',
    ]);
    expect(plainParagraphs('   ')).toEqual([]);
  });
});
