/**
 * Shared Zod building blocks. Rules mirror the database CHECK constraints in
 * supabase/migrations/0002_helpers.sql and 0003_tables.sql, so forms reject exactly
 * what the database would reject.
 */
import { z } from 'zod';
import { Constants } from '../database.types';

export const Enums = Constants.public.Enums;

/** Text with a max length (and optional min after trimming). */
export const text = (max: number, min = 0) =>
  z
    .string()
    .max(max, `Keep it under ${max + 1} characters`)
    .refine((s) => s.trim().length >= min, min > 0 ? 'Required' : undefined);

export const requiredText = (max: number) => text(max, 1);

export const httpsUrl = z
  .string()
  .max(2000)
  .regex(/^https:\/\/[^\s/?#]+\S*$/, 'Must be a full https:// link');

/** Path inside a storage bucket, e.g. "images/projects/2b1f.webp" */
export const storagePath = z
  .string()
  .max(500)
  .regex(/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/, 'Invalid file path')
  .refine((s) => !s.includes('..') && !s.includes('//'), 'Invalid file path');

export const slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const email = z
  .string()
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address');

export const isoDate = z.iso.date();
export const timestamp = z.iso.datetime({ offset: true });
export const uuid = z.uuid();

/** Image reference stored as jsonb (master spec A-5: alt text is required). */
export const imageRef = z.strictObject({
  path: z.union([storagePath, httpsUrl]),
  alt: requiredText(200),
  width: z.number().positive().max(20000).nullish(),
  height: z.number().positive().max(20000).nullish(),
  blurhash: z.string().max(100).nullish(),
});
export type ImageRef = z.infer<typeof imageRef>;

/** A list of short non-blank strings (tech tags, highlights). */
export const textList = (maxItems: number, maxLen: number) =>
  z.array(requiredText(maxLen)).max(maxItems, `At most ${maxItems} items`);

/** Columns every content table has (spec 01 DM-1). */
export const contentBase = {
  id: uuid,
  sort_order: z.number().int(),
  is_published: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
};

/** Fields the database fills in; never sent from forms. */
export const serverManaged = { id: true, created_at: true, updated_at: true } as const;
