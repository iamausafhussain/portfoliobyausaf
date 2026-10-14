/**
 * Which stored files each row uses, and cleanup of files nothing uses any more
 * (spec 02 AD-14, AD-37, AD-38).
 */
import { adminTables, type AdminRepository, type AdminTable, type Row } from '../repository/types';

const STORED_PATH = /^(images|videos|documents)\/[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

/** Every storage path referenced anywhere inside a value (image refs, video columns, resume…). */
export function fileRefs(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (STORED_PATH.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) fileRefs(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) fileRefs(v, out);
  }
  return out;
}

export interface FileUsage {
  table: AdminTable | 'site_settings';
  id: string;
  label: string;
}

const labelOf = (table: AdminTable, row: Row): string => {
  const r = row as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === 'string' && r[k] ? String(r[k]) : '');
  switch (table) {
    case 'experience':
      return [text('role'), text('company')].filter(Boolean).join(' · ');
    case 'skills':
    case 'custom_sections':
      return text('name');
    case 'testimonials':
      return text('author_name');
    case 'custom_items': {
      const data = (r.data ?? {}) as Record<string, unknown>;
      const first = Object.values(data).find((v) => typeof v === 'string' && v.trim());
      return typeof first === 'string' ? first : 'Item';
    }
    default:
      return text('title') || text('name') || 'Untitled';
  }
};

/** Map of stored path → where it is used. Reads every table (the data set is small). */
export async function buildUsageIndex(repo: AdminRepository): Promise<Map<string, FileUsage[]>> {
  const index = new Map<string, FileUsage[]>();
  const add = (path: string, usage: FileUsage) => index.set(path, [...(index.get(path) ?? []), usage]);

  const settings = await repo.data.getSettings();
  for (const p of fileRefs(settings)) add(p, { table: 'site_settings', id: '1', label: 'Site settings' });

  const lists = await Promise.all(adminTables.map((t) => repo.data.list(t)));
  adminTables.forEach((table, i) => {
    for (const row of lists[i] ?? []) {
      for (const p of fileRefs(row)) add(p, { table, id: row.id, label: labelOf(table, row) });
    }
  });
  return index;
}

/**
 * Deletes the given files if nothing references them any more. Returns the deleted paths.
 * Failures are swallowed: leftovers show up as "Unused" in the media library.
 */
export async function removeIfUnused(repo: AdminRepository, candidates: Iterable<string>): Promise<string[]> {
  const list = [...new Set(candidates)];
  if (list.length === 0) return [];
  try {
    const index = await buildUsageIndex(repo);
    const unused = list.filter((p) => !index.has(p));
    if (unused.length) await repo.files.remove(unused);
    return unused;
  } catch {
    return [];
  }
}

/** Files referenced by `before` that `after` no longer references. */
export function droppedFiles(before: unknown, after: unknown): string[] {
  const kept = fileRefs(after);
  return [...fileRefs(before)].filter((p) => !kept.has(p));
}
