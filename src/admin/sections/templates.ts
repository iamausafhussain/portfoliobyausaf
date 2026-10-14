/** Starter templates for new sections (spec 02 AD-53). Every field can be changed afterwards. */
import type { FieldDefinition } from '../../data/schemas';

export interface SectionTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  layout: 'grid' | 'list' | 'timeline' | 'carousel' | 'gallery';
  intro: string;
  fields: FieldDefinition[];
}

export const sectionTemplates: SectionTemplate[] = [
  {
    id: 'talks',
    name: 'Talks',
    slug: 'talks',
    description: 'Talks, workshops and podcast appearances.',
    layout: 'list',
    intro: 'Talks, workshops and podcasts.',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'event', label: 'Event', type: 'text', required: false },
      { key: 'date', label: 'Date', type: 'date', required: false },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        required: true,
        options: ['Talk', 'Workshop', 'Podcast', 'Panel'],
      },
      { key: 'link', label: 'Recording or slides', type: 'url', required: false },
      { key: 'photo', label: 'Photo', type: 'image', required: false },
    ],
  },
  {
    id: 'certifications',
    name: 'Certifications',
    slug: 'certifications',
    description: 'Courses and certificates with a verification link.',
    layout: 'grid',
    intro: 'Courses and certifications.',
    fields: [
      { key: 'title', label: 'Certificate', type: 'text', required: true },
      { key: 'issuer', label: 'Issuer', type: 'text', required: true },
      { key: 'issued_on', label: 'Issued on', type: 'date', required: false },
      { key: 'credential_url', label: 'Verification link', type: 'url', required: false },
      { key: 'badge', label: 'Badge', type: 'image', required: false },
      { key: 'skills', label: 'Skills', type: 'tags', required: false },
    ],
  },
  {
    id: 'publications',
    name: 'Publications',
    slug: 'publications',
    description: 'Articles, blog posts and papers.',
    layout: 'list',
    intro: 'Writing.',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'publisher', label: 'Published in', type: 'text', required: false },
      { key: 'date', label: 'Date', type: 'date', required: false },
      { key: 'summary', label: 'Summary', type: 'long_text', required: false },
      { key: 'link', label: 'Link', type: 'url', required: true },
    ],
  },
  {
    id: 'gear',
    name: 'Gear',
    slug: 'gear',
    description: 'Cameras, drones and tools you use.',
    layout: 'gallery',
    intro: 'What I shoot and build with.',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: ['Camera', 'Drone', 'Lens', 'Audio', 'Computer', 'Other'],
      },
      { key: 'photo', label: 'Photo', type: 'image', required: true },
      { key: 'notes', label: 'Why I use it', type: 'long_text', required: false },
      { key: 'link', label: 'Product link', type: 'url', required: false },
    ],
  },
  {
    id: 'blank',
    name: '',
    slug: '',
    description: 'Start from one text field and build your own.',
    layout: 'grid',
    intro: '',
    fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
  },
];

export const fieldTypeLabels: Record<FieldDefinition['type'], string> = {
  text: 'Short text',
  long_text: 'Paragraph',
  markdown: 'Rich text (Markdown)',
  number: 'Number',
  date: 'Date',
  url: 'Link',
  image: 'Image',
  tags: 'Tags',
  boolean: 'Yes / no',
  select: 'Choice from a list',
};

/** label → key: "Event name" → "event_name" (must start with a letter, max 30). */
export function keyFromLabel(label: string): string {
  const k = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 30)
    .replace(/_+$/, '');
  return k || 'field';
}

/** Makes `key` unique among `taken` by adding _2, _3, … */
export function uniqueKey(key: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(key)) return key;
  for (let i = 2; ; i++) {
    const candidate = `${key.slice(0, 27)}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Empty values for a new item. */
export function emptyItemData(fields: readonly FieldDefinition[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === 'tags') data[f.key] = [];
    else if (f.type === 'boolean') data[f.key] = false;
    else if (f.type === 'text' || f.type === 'long_text' || f.type === 'markdown') data[f.key] = '';
    else if (f.type === 'select' && f.required && f.options?.[0]) data[f.key] = f.options[0];
    else data[f.key] = null;
  }
  return data;
}

export interface FieldChange {
  key: string;
  label: string;
  itemsWithValues: number;
  kind: 'removed' | 'type_changed';
}

const hasValue = (v: unknown) =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/**
 * What changing a section's fields does to existing items (AD-54).
 * Renaming a key counts as removing the old key (its values are kept but hidden).
 */
export function fieldChanges(
  before: readonly FieldDefinition[],
  after: readonly FieldDefinition[],
  items: readonly { data: Record<string, unknown> }[],
): FieldChange[] {
  const afterByKey = new Map(after.map((f) => [f.key, f]));
  const out: FieldChange[] = [];
  for (const f of before) {
    const count = items.filter((i) => hasValue(i.data[f.key])).length;
    if (count === 0) continue;
    const next = afterByKey.get(f.key);
    if (!next) out.push({ key: f.key, label: f.label, itemsWithValues: count, kind: 'removed' });
    else if (next.type !== f.type)
      out.push({ key: f.key, label: f.label, itemsWithValues: count, kind: 'type_changed' });
  }
  return out;
}

/** Values in an item for keys no field defines any more (AD-55). */
export function hiddenData(
  fields: readonly FieldDefinition[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const keys = new Set(fields.map((f) => f.key));
  return Object.fromEntries(Object.entries(data).filter(([k, v]) => !keys.has(k) && hasValue(v)));
}
