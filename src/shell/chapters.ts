/**
 * The home page's chapter list (spec 03 HP-1 – HP-5, §3.3).
 * Pure ordering logic here; React glue in ChapterRegistry.tsx.
 */
import type { CustomSection } from '../data/schemas';

export const builtInChapters = [
  'hero',
  'about',
  'projects',
  'credits',
  'timeline',
  'reviews',
  'shop',
  'contact',
] as const;
export type BuiltInChapter = (typeof builtInChapters)[number];

/** Chapter names from the master spec §5. */
export const chapterTitles: Record<BuiltInChapter, string> = {
  hero: 'Opening Scene',
  about: 'About',
  projects: 'The System',
  credits: 'Credits Roll',
  timeline: 'Timeline',
  reviews: 'Reviews',
  shop: 'Box Office',
  contact: 'Final Scene',
};

/** Short plain-language names used where space is tight (Fast Lane, menu subtitles). */
export const chapterPlainNames: Record<BuiltInChapter, string> = {
  hero: 'Intro',
  about: 'About me',
  projects: 'Projects',
  credits: 'Achievements',
  timeline: 'Experience & skills',
  reviews: 'Testimonials',
  shop: 'Shop',
  contact: 'Contact',
};

export interface ChapterEntry {
  /** DOM id / URL hash: 'projects', 's-talks', … */
  id: string;
  /** 1-based, shown as CH 01 */
  number: number;
  title: string;
  subtitle: string;
  kind: 'built-in' | 'custom';
  key?: BuiltInChapter;
  section?: CustomSection;
}

export const sectionAnchor = (slug: string) => `s-${slug}`;

/**
 * Built-in chapters in fixed order; each published section with "show on home page" goes
 * after its `insert_after` chapter, ordered by sort_order then name; contact is always last.
 */
export function orderChapters(
  sections: readonly CustomSection[],
  /** the Box Office shows only when there's something to sell (spec 08 BX-1) */
  options: { shop?: boolean } = {},
): ChapterEntry[] {
  const onHome = sections
    .filter((s) => s.is_published && s.show_on_home)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const out: Omit<ChapterEntry, 'number'>[] = [];
  for (const key of builtInChapters) {
    if (key !== 'shop' || options.shop)
      out.push({
        id: key,
        title: chapterTitles[key],
        subtitle: chapterPlainNames[key],
        kind: 'built-in',
        key,
      });
    if (key === 'contact') break;
    for (const s of onHome.filter((x) => x.insert_after === key)) {
      out.push({ id: sectionAnchor(s.slug), title: s.name, subtitle: s.intro, kind: 'custom', section: s });
    }
  }
  return out.map((c, i) => ({ ...c, number: i + 1 }));
}

/** "CH 02" */
export const chapterCode = (n: number) => `CH ${String(n).padStart(2, '0')}`;
