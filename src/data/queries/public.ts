/**
 * TanStack Query hooks for the public site (spec 01 §3.9). Admin hooks arrive in Part 2.
 *
 * Every query asks for published rows explicitly (so the owner, who can see drafts through
 * RLS, still sees the public view here) and parses results through the entity's Zod schema.
 */
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';
import { parseRow, parseRows } from '../parse';
import {
  achievementRow,
  buildItemSchema,
  customItemRow,
  customSectionRow,
  experienceRow,
  heroMediaRow,
  projectRow,
  siteSettingsRow,
  skillRow,
  testimonialRow,
  type CustomItem,
  type CustomSection,
} from '../schemas';

type PublishedTable =
  'hero_media' | 'projects' | 'achievements' | 'experience' | 'skills' | 'testimonials' | 'custom_sections';

export const queryKeys = {
  siteSettings: ['site_settings'] as const,
  published: (table: PublishedTable) => ['published', table] as const,
  project: (slug: string) => ['published', 'projects', slug] as const,
  customSections: ['published', 'custom_sections', 'with_items'] as const,
};

async function fetchPublished(table: PublishedTable) {
  const { data, error } = await getSupabase()
    .from(table)
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export function useSiteSettings() {
  return useQuery({
    queryKey: queryKeys.siteSettings,
    queryFn: async () => {
      const { data, error } = await getSupabase().from('site_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return parseRow(siteSettingsRow, data, 'site_settings');
    },
  });
}

export function usePublishedHeroMedia() {
  return useQuery({
    queryKey: queryKeys.published('hero_media'),
    queryFn: async () => parseRows(heroMediaRow, await fetchPublished('hero_media'), 'hero_media'),
  });
}

export function usePublishedProjects() {
  return useQuery({
    queryKey: queryKeys.published('projects'),
    queryFn: async () => parseRows(projectRow, await fetchPublished('projects'), 'projects'),
  });
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: queryKeys.project(slug),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('projects')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      return parseRow(projectRow, data, 'projects');
    },
  });
}

export function usePublishedAchievements() {
  return useQuery({
    queryKey: queryKeys.published('achievements'),
    queryFn: async () => parseRows(achievementRow, await fetchPublished('achievements'), 'achievements'),
  });
}

export function usePublishedExperience() {
  return useQuery({
    queryKey: queryKeys.published('experience'),
    queryFn: async () => parseRows(experienceRow, await fetchPublished('experience'), 'experience'),
  });
}

export function usePublishedSkills() {
  return useQuery({
    queryKey: queryKeys.published('skills'),
    queryFn: async () => parseRows(skillRow, await fetchPublished('skills'), 'skills'),
  });
}

export function usePublishedTestimonials() {
  return useQuery({
    queryKey: queryKeys.published('testimonials'),
    queryFn: async () => parseRows(testimonialRow, await fetchPublished('testimonials'), 'testimonials'),
  });
}

export interface SectionWithItems {
  section: CustomSection;
  items: CustomItem[];
}

/**
 * Published custom sections with their published items. Each item's `data` is also
 * validated against the section's own field definitions; invalid items are skipped.
 */
export function usePublishedCustomSections() {
  return useQuery({
    queryKey: queryKeys.customSections,
    queryFn: async (): Promise<SectionWithItems[]> => {
      const sections = parseRows(
        customSectionRow,
        await fetchPublished('custom_sections'),
        'custom_sections',
      );
      if (sections.length === 0) return [];

      const { data, error } = await getSupabase()
        .from('custom_items')
        .select('*')
        .in(
          'section_id',
          sections.map((s) => s.id),
        )
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const items = parseRows(customItemRow, data, 'custom_items');

      return sections.map((section) => {
        const itemSchema = buildItemSchema(section.fields);
        const sectionItems = items.filter((i) => i.section_id === section.id);
        const valid = sectionItems.filter(
          (item) => parseRow(itemSchema, item.data, `custom_items (${section.slug})`) !== null,
        );
        return { section, items: valid };
      });
    },
  });
}
