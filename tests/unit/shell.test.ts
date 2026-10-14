/** Part 3 logic that needs no browser: tiers, chapter order, pre-paint theme script. */
import { describe, expect, it } from 'vitest';
import type { CustomSection } from '../../src/data/schemas';
import { detectTier, lowerTier, median, tierOverride, type DeviceEnv } from '../../src/device/tier';
import { chapterCode, orderChapters } from '../../src/shell/chapters';
import { buildThemeScript, themeColor } from '../../src/theme/themeScript';
import { themes } from '../../src/theme/tokens';

const desktop: DeviceEnv = {
  webgl: true,
  saveData: false,
  memoryGB: 8,
  cores: 8,
  touch: false,
  mobileUA: false,
  gpu: 'ANGLE (NVIDIA GeForce RTX 3060)',
};

describe('detectTier (AC-3.14)', () => {
  const t = (patch: Partial<DeviceEnv>) => detectTier({ ...desktop, ...patch }).tier;
  it('high on a capable desktop', () => expect(t({})).toBe('high'));
  it('low without WebGL, with Data Saver, ≤2 GB or ≤2 cores, or software rendering', () => {
    expect(t({ webgl: false })).toBe('low');
    expect(t({ saveData: true })).toBe('low');
    expect(t({ memoryGB: 2 })).toBe('low');
    expect(t({ cores: 2 })).toBe('low');
    expect(t({ gpu: 'Google SwiftShader' })).toBe('low');
    expect(t({ gpu: 'llvmpipe (LLVM 15.0.7)' })).toBe('low');
  });
  it('mid on phones/tablets, ≤4 GB, or known low-end GPUs', () => {
    expect(t({ mobileUA: true })).toBe('mid');
    expect(t({ touch: true })).toBe('mid');
    expect(t({ memoryGB: 4 })).toBe('mid');
    expect(t({ gpu: 'Mali-T628' })).toBe('mid');
    expect(t({ gpu: 'Adreno (TM) 506' })).toBe('mid');
    expect(t({ gpu: 'PowerVR SGX 544MP' })).toBe('mid');
    expect(t({ gpu: 'Intel(R) HD Graphics 4000' })).toBe('mid');
  });
  it('modern mobile GPUs and newer Intel graphics are not flagged', () => {
    expect(t({ gpu: 'Adreno (TM) 740' })).toBe('high');
    expect(t({ gpu: 'Intel(R) HD Graphics 620' })).toBe('high');
    expect(t({ gpu: 'Apple M2' })).toBe('high');
  });
  it('gives a reason', () => expect(detectTier({ ...desktop, saveData: true }).reason).toMatch(/Data Saver/));
  it('the probe only lowers, never below low', () => {
    expect(lowerTier('high')).toBe('mid');
    expect(lowerTier('mid')).toBe('low');
    expect(lowerTier('low')).toBe('low');
  });
  it('?tier= override', () => {
    expect(tierOverride('?tier=low')).toBe('low');
    expect(tierOverride('?x=1&tier=high')).toBe('high');
    expect(tierOverride('?tier=ultra')).toBeNull();
  });
  it('median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

const section = (p: Partial<CustomSection>): CustomSection => ({
  id: p.slug ?? 'x',
  name: p.name ?? 'Section',
  slug: 'section',
  intro: '',
  layout: 'grid',
  fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
  insert_after: 'reviews',
  show_on_home: true,
  has_page: false,
  show_in_nav: false,
  sort_order: 0,
  is_published: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...p,
});

describe('orderChapters (AC-3.10)', () => {
  it('built-ins in fixed order, numbered from 1, contact last', () => {
    const ids = orderChapters([]).map((c) => `${c.number}:${c.id}`);
    expect(ids).toEqual([
      '1:hero',
      '2:about',
      '3:projects',
      '4:credits',
      '5:timeline',
      '6:reviews',
      '7:contact',
    ]);
  });
  it('sections go after their chapter by sort_order then name; drafts and hidden ones are left out', () => {
    const list = orderChapters([
      section({ slug: 'talks', name: 'Talks', insert_after: 'reviews', sort_order: 2 }),
      section({ slug: 'gear', name: 'Gear', insert_after: 'reviews', sort_order: 1 }),
      section({ slug: 'certs', name: 'Certs', insert_after: 'projects', sort_order: 0 }),
      section({ slug: 'b-same', name: 'B', insert_after: 'about', sort_order: 0 }),
      section({ slug: 'a-same', name: 'A', insert_after: 'about', sort_order: 0 }),
      section({ slug: 'draft', is_published: false }),
      section({ slug: 'hidden', show_on_home: false }),
    ]);
    expect(list.map((c) => c.id)).toEqual([
      'hero',
      'about',
      's-a-same',
      's-b-same',
      'projects',
      's-certs',
      'credits',
      'timeline',
      'reviews',
      's-gear',
      's-talks',
      'contact',
    ]);
    expect(list.at(-1)?.number).toBe(12);
  });
  it('chapterCode', () => {
    expect(chapterCode(2)).toBe('CH 02');
    expect(chapterCode(12)).toBe('CH 12');
  });
});

describe('pre-paint theme script (AC-3.1, AC-3.2, AC-3.6)', () => {
  /** Runs the script against a fake document/window and returns what it set. */
  function run(opts: { stored?: string | null; osLight?: boolean; storageThrows?: boolean; lite?: boolean }) {
    const attrs: Record<string, string> = {};
    const meta: Record<string, string> = {};
    const document = {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
      querySelector: () => ({ setAttribute: (k: string, v: string) => (meta[k] = v) }),
    };
    const localStorage = {
      getItem: (k: string) => {
        if (opts.storageThrows) throw new Error('blocked');
        if (k === 'theme') return opts.stored ?? null;
        if (k === 'lite') return opts.lite ? '1' : null;
        return null;
      },
    };
    const matchMedia = (q: string) => ({ matches: q.includes('light') ? !!opts.osLight : false });
    const window = { matchMedia };
    new Function('document', 'localStorage', 'matchMedia', 'window', buildThemeScript())(
      document,
      localStorage,
      matchMedia,
      window,
    );
    return { attrs, meta };
  }

  it('follows the OS when nothing is saved (dark is the default)', () => {
    expect(run({ osLight: true }).attrs).toMatchObject({ 'data-theme': 'light', 'data-theme-source': 'os' });
    expect(run({ osLight: false }).attrs).toMatchObject({ 'data-theme': 'dark', 'data-theme-source': 'os' });
  });
  it('a saved choice wins over the OS', () => {
    expect(run({ stored: 'dark', osLight: true }).attrs).toMatchObject({
      'data-theme': 'dark',
      'data-theme-source': 'user',
    });
  });
  it('ignores junk in storage and survives blocked storage', () => {
    expect(run({ stored: 'purple', osLight: true }).attrs['data-theme']).toBe('light');
    expect(run({ storageThrows: true, osLight: false }).attrs['data-theme']).toBe('dark');
  });
  it('sets theme-color to the theme background', () => {
    expect(run({ stored: 'light' }).meta.content).toBe(themes.light.color.bg);
    expect(themeColor('dark')).toBe(themes.dark.color.bg);
  });
  it('applies saved Lite mode before paint', () => {
    expect(run({ lite: true }).attrs['data-tier']).toBe('low');
  });
  it('stays small', () => expect(buildThemeScript().length).toBeLessThan(800));
});
