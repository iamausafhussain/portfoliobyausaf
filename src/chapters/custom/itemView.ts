/**
 * How a custom item's fields map onto a card (spec 06 CS-2). Pure, so it's unit-tested.
 *  first text → title · second text → subtitle · first image → picture · first date → date
 *  url → links · markdown / long text → body · select, tags, number, yes/no → tags
 */
import type { FieldDefinition, ImageRef } from '../../data/schemas';
import { itemTitle } from '../../data/schemas';

export interface ItemView {
  title: string;
  subtitle: string | null;
  image: ImageRef | null;
  date: string | null;
  body: string | null;
  links: { label: string; url: string }[];
  tags: string[];
}

const isImage = (v: unknown): v is ImageRef =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as ImageRef).path === 'string' &&
  typeof (v as ImageRef).alt === 'string';
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function itemView(
  fields: readonly FieldDefinition[],
  data: Record<string, unknown>,
  index: number,
): ItemView {
  const texts = fields.filter((f) => f.type === 'text');
  const view: ItemView = {
    title: itemTitle(fields, data, index),
    subtitle: texts[1] ? str(data[texts[1].key]) : null,
    image: null,
    date: null,
    body: null,
    links: [],
    tags: [],
  };
  for (const f of fields) {
    const v = data[f.key];
    if (v === null || v === undefined || v === '') continue;
    switch (f.type) {
      case 'image':
        if (!view.image && isImage(v)) view.image = v;
        break;
      case 'date':
        if (!view.date && str(v)) view.date = str(v);
        break;
      case 'url':
        if (str(v)) view.links.push({ label: f.label, url: str(v)! });
        break;
      case 'markdown':
      case 'long_text':
        if (!view.body && str(v)) view.body = str(v);
        break;
      case 'select':
        if (str(v)) view.tags.push(str(v)!);
        break;
      case 'tags':
        if (Array.isArray(v)) view.tags.push(...v.filter((t): t is string => typeof t === 'string'));
        break;
      case 'number':
        if (typeof v === 'number') view.tags.push(`${f.label}: ${v}`);
        break;
      case 'boolean':
        if (v === true) view.tags.push(f.label);
        break;
    }
  }
  return view;
}

/** Items newest first by their date (undated last), for the timeline layout. */
export function byDateDesc<T extends { view: ItemView }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.view.date ?? '').localeCompare(a.view.date ?? ''));
}
