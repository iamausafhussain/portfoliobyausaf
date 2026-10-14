/**
 * Admin-defined sections (spec 01 §3.3 custom_sections / custom_items, DM-7).
 *
 * The database validates the shape of field definitions and that item data is an object.
 * buildItemSchema() turns a section's field definitions into a Zod schema that validates
 * each item's values (required fields, types, select options).
 */
import { z } from 'zod';
import {
  contentBase,
  Enums,
  httpsUrl,
  imageRef,
  isoDate,
  requiredText,
  serverManaged,
  slug,
  text,
  uuid,
} from './common';

export const fieldTypes = [
  'text',
  'long_text',
  'markdown',
  'number',
  'date',
  'url',
  'image',
  'tags',
  'boolean',
  'select',
] as const;
export type FieldType = (typeof fieldTypes)[number];

/** Slugs a custom section cannot use (spec 01 §3.3). */
export const reservedSectionSlugs = ['admin', 'projects', 'resume', 's'] as const;

export const fieldDefinition = z
  .strictObject({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/, 'Start with a letter; use a–z, 0–9 and _ (max 30)'),
    label: requiredText(40),
    type: z.enum(fieldTypes),
    required: z.boolean(),
    options: z.array(requiredText(60)).min(1).max(50).nullish(),
    help: text(120).nullish(),
  })
  .superRefine((f, ctx) => {
    if (f.type === 'select') {
      if (!f.options?.length)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least one option' });
      else if (new Set(f.options).size !== f.options.length)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique' });
    } else if (f.options != null) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only select fields have options' });
    }
  });
export type FieldDefinition = z.infer<typeof fieldDefinition>;

export const fieldDefinitions = z
  .array(fieldDefinition)
  .min(1, 'Add at least one field')
  .max(15, 'At most 15 fields')
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Keys must be unique' });
      seen.add(f.key);
    });
  });

const customSectionFields = z.object({
  ...contentBase,
  name: requiredText(60),
  slug: slug.refine(
    (s) => !(reservedSectionSlugs as readonly string[]).includes(s),
    'This address is reserved',
  ),
  intro: text(500),
  layout: z.enum(Enums.section_layout),
  fields: fieldDefinitions,
  insert_after: z
    .enum(Enums.chapter_key)
    .refine((k) => k !== 'contact', 'Contact is always the last chapter'),
  show_on_home: z.boolean(),
  has_page: z.boolean(),
  show_in_nav: z.boolean(),
});
export const customSectionRow = customSectionFields;
export type CustomSection = z.infer<typeof customSectionRow>;
export const customSectionInsert = customSectionFields.omit(serverManaged).partial({
  sort_order: true,
  is_published: true,
  intro: true,
  layout: true,
  insert_after: true,
  show_on_home: true,
  has_page: true,
  show_in_nav: true,
});
export const customSectionUpdate = customSectionInsert.partial();

/** Item rows: `data` is validated separately with buildItemSchema(section.fields). */
export const customItemRow = z.object({
  ...contentBase,
  section_id: uuid,
  data: z.record(z.string(), z.unknown()),
});
export type CustomItem = z.infer<typeof customItemRow>;
export const customItemInsert = customItemRow
  .omit(serverManaged)
  .partial({ sort_order: true, is_published: true });

/** Max size of one item's data (matches the 50 KB database limit). */
export const MAX_ITEM_BYTES = 51200;

/** Per-type value rules. */
function valueSchema(field: FieldDefinition): z.ZodType {
  switch (field.type) {
    case 'text':
      return field.required ? requiredText(200) : text(200);
    case 'long_text':
      return field.required ? requiredText(2000) : text(2000);
    case 'markdown':
      return field.required ? requiredText(10000) : text(10000);
    case 'number':
      return z.number().finite();
    case 'date':
      return isoDate;
    case 'url':
      return httpsUrl;
    case 'image':
      return imageRef;
    case 'tags': {
      const tags = z.array(requiredText(40)).max(20, 'At most 20 tags');
      return field.required ? tags.min(1, 'Add at least one tag') : tags;
    }
    case 'boolean':
      return z.boolean();
    case 'select': {
      const [first, ...rest] = field.options ?? [];
      return first === undefined ? z.never() : z.enum([first, ...rest]);
    }
  }
}

/**
 * Build a Zod schema for one custom section's items.
 * - Required fields must be present (and non-blank for text).
 * - Optional fields accept a missing value, null, or (for text) an empty string.
 * - Keys that are no longer defined are KEPT, so renaming or removing a field never
 *   deletes stored data (spec 01 DM-7).
 */
export function buildItemSchema(fields: readonly FieldDefinition[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    const base = valueSchema(field);
    shape[field.key] = field.required ? base : base.nullish();
  }
  return z.looseObject(shape).refine((data) => {
    try {
      return new TextEncoder().encode(JSON.stringify(data)).length <= MAX_ITEM_BYTES;
    } catch {
      return false;
    }
  }, 'This item is too large (50 KB max)');
}

/** The value shown as an item's title in lists: the first text field, else "Item N". */
export function itemTitle(
  fields: readonly FieldDefinition[],
  data: Record<string, unknown>,
  index: number,
): string {
  const titleField = fields.find((f) => f.type === 'text');
  const value = titleField ? data[titleField.key] : undefined;
  return typeof value === 'string' && value.trim() ? value : `Item ${index + 1}`;
}
