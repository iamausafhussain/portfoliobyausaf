/**
 * Where the public site reads its content from (spec 03 PD-1):
 *  - Supabase (production and normal development), limited to published rows by RLS,
 *  - the in-memory demo backend when `npm run dev:demo` is running (development only;
 *    never part of a production build, PD-2).
 */
import { mediaUrl } from '../lib/media';
import { PostgrestClient } from '@supabase/postgrest-js';
import { readSupabaseEnv, supabaseUrl } from '../lib/env';
import type { Database } from './database.types';

export type PublishedTable =
  'hero_media' | 'projects' | 'achievements' | 'experience' | 'skills' | 'testimonials' | 'custom_sections';

export interface PublicSource {
  kind: 'supabase' | 'demo';
  settings(): Promise<unknown>;
  /** Published rows in display order. */
  published(table: PublishedTable): Promise<unknown[]>;
  projectBySlug(slug: string): Promise<unknown>;
  /** Published items of the given (published) sections, in display order. */
  itemsFor(sectionIds: string[]): Promise<unknown[]>;
  /** Browser-loadable URL for a stored path or an https URL. */
  mediaUrl(path: string): string;
}

/**
 * Public reads need only the database REST API, not the full Supabase client (auth,
 * realtime, storage…), which keeps the first download small (master spec P-2). The anon
 * key sees published rows only (RLS).
 */
let rest: PostgrestClient<Database> | null = null;
function db(): PostgrestClient<Database> {
  if (rest) return rest;
  const { url, anonKey } = readSupabaseEnv(import.meta.env);
  rest = new PostgrestClient<Database>(`${url}/rest/v1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  return rest;
}

const supabaseSource: PublicSource = {
  kind: 'supabase',
  async settings() {
    const { data, error } = await db().from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data;
  },
  async published(table) {
    const { data, error } = await db()
      .from(table)
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  async projectBySlug(slug) {
    const { data, error } = await db()
      .from('projects')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async itemsFor(sectionIds) {
    if (sectionIds.length === 0) return [];
    const { data, error } = await db()
      .from('custom_items')
      .select('*')
      .in('section_id', sectionIds)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  mediaUrl: (path) => mediaUrl(path, supabaseUrl()),
};

let resolved: PublicSource | null = null;
let pending: Promise<PublicSource> | null = null;

export function getPublicSource(): Promise<PublicSource> {
  if (resolved) return Promise.resolve(resolved);
  pending ??= (async () => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEMO === '1') {
      const { loadRepository } = await import('../admin/repository');
      const repo = (await loadRepository()) as { publicSource?: PublicSource };
      if (repo.publicSource) return (resolved = repo.publicSource);
    }
    return (resolved = supabaseSource);
  })();
  return pending;
}

/** URL for a stored media path; uses the demo files in demo mode. */
export function publicMediaUrl(path: string): string {
  try {
    return (resolved ?? supabaseSource).mediaUrl(path);
  } catch {
    return /^https:\/\//.test(path) ? path : '';
  }
}
