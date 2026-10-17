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
import { SendError, sendErrorCode } from './contact';
import type { MessageInsert } from './schemas';
import { shopErrorFrom, ShopError, type ShopPublicApi } from './shop';
import type { TrackPayload } from '../analytics/track';
import type { ErrorReport } from '../analytics/errors';

export type PublishedTable =
  | 'hero_media'
  | 'projects'
  | 'achievements'
  | 'experience'
  | 'skills'
  | 'testimonials'
  | 'custom_sections'
  | 'products';

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
  /** Stores a contact message; throws SendError with a code on refusal (spec 07 §3.1). */
  sendMessage(message: MessageInsert): Promise<void>;
  /** A published product by its web address (spec 08 BX-3). */
  productBySlug(slug: string): Promise<unknown>;
  /** The shop's server side (spec 08 §3.1). */
  shop: ShopPublicApi;
  /** One analytics event (spec 09 TR-1); fire-and-forget. */
  track(event: TrackPayload): Promise<void>;
  /** One error report (spec 09 OP-3); fire-and-forget. */
  reportError(report: ErrorReport): Promise<void>;
}

/** Calls a database function with the public key, without waiting for or reading the answer. */
async function callRpc(name: string, body: Record<string, unknown>): Promise<void> {
  const { url, anonKey } = readSupabaseEnv(import.meta.env);
  await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    // survives the page being closed straight after (TR-5)
    keepalive: true,
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Calls one of the shop's Edge Functions with the public key; errors become ShopErrors. */
async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { url, anonKey } = readSupabaseEnv(import.meta.env);
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ShopError('offline');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw shopErrorFrom(res.status, data);
  return data as T;
}

const supabaseShop: ShopPublicApi = {
  checkout: (productId, currency, code) =>
    callFunction('shop-checkout', { product_id: productId, currency, ...(code ? { code } : {}) }),
  orderStatus: (ref, paymentId) =>
    callFunction('shop-order-status', { ref, ...(paymentId ? { payment_id: paymentId } : {}) }),
  downloadInfo: (token) => callFunction('shop-download', { token, action: 'info' }),
  download: (token) => callFunction('shop-download', { token, action: 'download' }),
  refresh: (token) => callFunction('shop-download', { token, action: 'refresh' }),
  claimFree: (productId, email, name) => callFunction('shop-claim', { product_id: productId, email, name }),
  async page(slug) {
    const { data, error } = await db()
      .from('shop_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

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
  async productBySlug(slug) {
    const { data, error } = await db()
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  shop: supabaseShop,
  async track(e) {
    await callRpc('track', {
      p_name: e.name,
      p_path: e.path,
      p_referrer: e.referrer,
      p_utm_source: e.utmSource,
      p_utm_medium: e.utmMedium,
      p_utm_campaign: e.utmCampaign,
      p_product: e.product,
      p_detail: e.detail,
      p_tz: e.tz,
    });
  },
  async reportError(r) {
    await callRpc('report_error', {
      p_message: r.message,
      p_stack: r.stack,
      p_path: r.path,
      p_release: r.release,
    });
  },
  async sendMessage(message) {
    // visitors can't read messages back, so ask for nothing in return
    let result;
    try {
      result = await db().from('messages').insert(message);
    } catch {
      throw new SendError('offline');
    }
    if (result.error) throw new SendError(sendErrorCode({ ...result.error, status: result.status }));
  },
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
