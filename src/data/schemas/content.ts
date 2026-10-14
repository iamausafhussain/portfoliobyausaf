/**
 * Zod schemas for every content entity (spec 01 §3.3).
 * Each entity has:
 *   - a Row schema (what the database returns)
 *   - an Insert schema (what the admin sends; db-managed columns removed, defaults optional)
 *   - an Update schema (partial Insert)
 */
import { z } from 'zod';
import {
  contentBase,
  email,
  Enums,
  httpsUrl,
  imageRef,
  isoDate,
  requiredText,
  serverManaged,
  slug,
  storagePath,
  text,
  textList,
  timestamp,
  uuid,
} from './common';

/** Known keys only; each link optional (missing, undefined or null all mean "no link"). */
const urlMap = <K extends string>(keys: readonly [K, ...K[]]) =>
  z.partialRecord(z.enum(keys), httpsUrl.nullish());

/* ------------------------------------------------------------------ */
/* site_settings                                                       */
/* ------------------------------------------------------------------ */
export const siteSettingsRow = z.object({
  id: z.literal(1),
  display_name: requiredText(80),
  tagline: text(160),
  bio_short: text(300),
  bio_long: text(5000),
  portrait: imageRef.nullable(),
  location: text(80),
  public_email: email.nullable(),
  resume_path: z.union([storagePath, httpsUrl]).nullable(),
  socials: urlMap(['github', 'linkedin', 'youtube', 'instagram', 'x']),
  available_for_work: z.boolean(),
  hero_playback: z.enum(Enums.hero_playback),
  seo: z.strictObject({
    title: text(70).nullish(),
    description: text(160).nullish(),
    og_image: imageRef.nullish(),
  }),
  updated_at: timestamp,
});
export type SiteSettings = z.infer<typeof siteSettingsRow>;
export const siteSettingsUpdate = siteSettingsRow.omit({ id: true, updated_at: true }).partial();

/* ------------------------------------------------------------------ */
/* hero_media                                                          */
/* ------------------------------------------------------------------ */
const heroMediaFields = z.object({
  ...contentBase,
  title: requiredText(100),
  source_type: z.enum(Enums.hero_source),
  video_mp4: z.string().min(1),
  video_webm: z.string().nullable(),
  video_mobile: z.string().nullable(),
  poster: imageRef,
  theme: z.enum(Enums.theme_scope),
});

/** Uploads must point into storage; external sources must be https URLs (master spec HM-2). */
const checkHeroSources = (
  v: {
    source_type?: 'upload' | 'url';
    video_mp4?: string;
    video_webm?: string | null;
    video_mobile?: string | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (!v.source_type) return;
  const rule = v.source_type === 'upload' ? storagePath : httpsUrl;
  for (const key of ['video_mp4', 'video_webm', 'video_mobile'] as const) {
    const value = v[key];
    if (value != null && !rule.safeParse(value).success) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: v.source_type === 'upload' ? 'Upload the file to storage' : 'Must be a full https:// link',
      });
    }
  }
};

export const heroMediaRow = heroMediaFields.superRefine(checkHeroSources);
export type HeroMedia = z.infer<typeof heroMediaRow>;
export const heroMediaInsert = heroMediaFields
  .omit(serverManaged)
  .partial({ sort_order: true, is_published: true, video_webm: true, video_mobile: true, theme: true })
  .superRefine(checkHeroSources);

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */
export const projectRow = z.object({
  ...contentBase,
  slug,
  title: requiredText(100),
  summary: requiredText(280),
  body: text(20000),
  category: z.enum(Enums.project_category),
  role: text(100),
  client: text(100).nullable(),
  year: z.number().int().min(2000).max(2100).nullable(),
  cover: imageRef.nullable(),
  gallery: z.array(imageRef).max(20),
  tech: textList(20, 40),
  links: urlMap(['live', 'repo', 'case_study', 'video']),
  is_featured: z.boolean(),
  globe: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
});
export type Project = z.infer<typeof projectRow>;
export const projectInsert = projectRow.omit(serverManaged).partial({
  sort_order: true,
  is_published: true,
  body: true,
  category: true,
  role: true,
  client: true,
  year: true,
  cover: true,
  gallery: true,
  tech: true,
  links: true,
  is_featured: true,
  globe: true,
});
export const projectUpdate = projectInsert.partial();

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */
export const achievementRow = z.object({
  ...contentBase,
  title: requiredText(150),
  kind: z.enum(Enums.achievement_kind),
  issuer: text(120).nullable(),
  awarded_on: isoDate.nullable(),
  description: text(1000),
  image: imageRef.nullable(),
  link: httpsUrl.nullable(),
  is_highlighted: z.boolean(),
});
export type Achievement = z.infer<typeof achievementRow>;
export const achievementInsert = achievementRow.omit(serverManaged).partial({
  sort_order: true,
  is_published: true,
  kind: true,
  issuer: true,
  awarded_on: true,
  description: true,
  image: true,
  link: true,
  is_highlighted: true,
});
export const achievementUpdate = achievementInsert.partial();

/* ------------------------------------------------------------------ */
/* experience                                                          */
/* ------------------------------------------------------------------ */
const experienceFields = z.object({
  ...contentBase,
  company: requiredText(120),
  role: requiredText(120),
  employment_type: z.enum(Enums.employment_type),
  location: text(80),
  start_date: isoDate,
  end_date: isoDate.nullable(),
  description: text(2000),
  highlights: textList(10, 200),
  tech: textList(20, 40),
  logo: imageRef.nullable(),
});
const datesOrdered = (v: { start_date?: string; end_date?: string | null }) =>
  !v.start_date || !v.end_date || v.end_date >= v.start_date;
const datesMessage = { message: 'End date must be after the start date', path: ['end_date'] };

export const experienceRow = experienceFields.refine(datesOrdered, datesMessage);
export type Experience = z.infer<typeof experienceRow>;
export const experienceInsert = experienceFields
  .omit(serverManaged)
  .partial({
    sort_order: true,
    is_published: true,
    employment_type: true,
    location: true,
    end_date: true,
    description: true,
    highlights: true,
    tech: true,
    logo: true,
  })
  .refine(datesOrdered, datesMessage);

/* ------------------------------------------------------------------ */
/* skills                                                              */
/* ------------------------------------------------------------------ */
export const skillRow = z.object({
  ...contentBase,
  name: requiredText(60),
  category: requiredText(40),
  level: z.number().int().min(1).max(5).nullable(),
  icon: z.string().max(500).nullable(),
  is_featured: z.boolean(),
});
export type Skill = z.infer<typeof skillRow>;
export const skillInsert = skillRow
  .omit(serverManaged)
  .partial({ sort_order: true, is_published: true, level: true, icon: true, is_featured: true });
export const skillUpdate = skillInsert.partial();

/** Category suggestions shown in the admin (free text is still allowed). */
export const skillCategorySuggestions = [
  'Frontend',
  'Backend',
  'Cloud',
  'Data',
  'DevOps',
  'Tools',
  'Creative',
] as const;

/* ------------------------------------------------------------------ */
/* testimonials                                                        */
/* ------------------------------------------------------------------ */
export const testimonialRow = z.object({
  ...contentBase,
  quote: requiredText(600),
  author_name: requiredText(80),
  author_role: text(80),
  author_company: text(80),
  avatar: imageRef.nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  source_url: httpsUrl.nullable(),
  project_id: uuid.nullable(),
});
export type Testimonial = z.infer<typeof testimonialRow>;
export const testimonialInsert = testimonialRow.omit(serverManaged).partial({
  sort_order: true,
  is_published: true,
  author_role: true,
  author_company: true,
  avatar: true,
  rating: true,
  source_url: true,
  project_id: true,
});
export const testimonialUpdate = testimonialInsert.partial();
