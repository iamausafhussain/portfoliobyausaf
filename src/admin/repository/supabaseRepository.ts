/**
 * Production repository backed by Supabase (spec 02 §3.3).
 * Security is enforced by RLS; this layer adds the edit-conflict check, upload progress
 * and plain error messages.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, supabaseUrl } from '../../lib/supabase';
import { mediaUrl } from '../../lib/media';
import { conflictError, mapDbError, networkError, RepoError, type DbErrorLike } from './errors';
import { checkFileForBucket } from './limits';
import { cleanSearch, searchFilter } from './messages';
import {
  messageTabs,
  type AdminRepository,
  type AdminTable,
  type AuthApi,
  type AuthState,
  type Bucket,
  type DataApi,
  type FilesApi,
  type MessageRow,
  type MessagesApi,
  type MessageTab,
  type OrderRow,
  type DiscountRow,
  type ProductFileRow,
  type Row,
  type ShopAdminApi,
  type ShopPageRow,
  type SettingsRow,
  type StoredFile,
} from './types';

/**
 * The typed client checks column names per table; the admin works on many tables
 * generically and validates values with Zod, so it uses the untyped view.
 */
const db = () => getSupabase() as unknown as SupabaseClient;

function fail(error: DbErrorLike | null, table: AdminTable | 'site_settings'): never {
  if (error && /fetch|network/i.test(error.message ?? '') && !error.code) throw networkError(error);
  throw mapDbError(error ?? {}, table);
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RepoError) throw e;
    if (e instanceof TypeError) throw networkError(e);
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const credentialsError = () => new RepoError('credentials', 'Email, password or code is incorrect.');

async function isOwnerAccount(): Promise<boolean> {
  // 0008 adds is_owner_account(), which works before the code is entered.
  const { data, error } = await db().rpc('is_owner_account');
  if (!error) return data === true;
  // Before 0008: fall back to is_owner(), which then works at aal1.
  const fallback = await db().rpc('is_owner');
  return fallback.data === true;
}

const auth: AuthApi = {
  async getState(): Promise<AuthState> {
    return guard(async () => {
      const client = getSupabase();
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (!session) return { status: 'signed_out' };
      const email = session.user.email;

      if (!(await isOwnerAccount())) return { status: 'not_owner', email };

      const { data: factors } = await client.auth.mfa.listFactors();
      const verified = factors?.totp ?? [];
      if (verified.length === 0) return { status: 'needs_setup', email };

      const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== 'aal2') return { status: 'needs_code', email };
      return { status: 'signed_in', email };
    });
  },

  onChange(listener) {
    const { data } = getSupabase().auth.onAuthStateChange(() => listener());
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password) {
    return guard(async () => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw credentialsError();
      const state = await auth.getState();
      if (state.status === 'not_owner') await getSupabase().auth.signOut({ scope: 'local' });
      return state;
    });
  },

  async startTotpSetup(name) {
    return guard(async () => {
      const client = getSupabase();
      // Clear abandoned, unverified setups first (names must be unique).
      const { data: list } = await client.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await client.auth.mfa.unenroll({ factorId: f.id });
      }
      const friendlyName =
        name?.trim() || `Authenticator ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
        // the name shown in the authenticator app
        issuer: 'Ausaf Hussain · Portfolio',
      });
      if (error || !data) throw new RepoError('unknown', error?.message ?? 'Could not start setup.');
      return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
    });
  },

  async finishTotpSetup(factorId, code) {
    return guard(async () => {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error)
        throw new RepoError(
          'credentials',
          "That code didn't match. Check the time on your phone and try again.",
        );
    });
  },

  async verifyCode(code) {
    return guard(async () => {
      const client = getSupabase();
      const { data } = await client.auth.mfa.listFactors();
      const factors = data?.totp ?? [];
      // Try each registered authenticator (main phone or backup).
      for (const f of factors) {
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
        if (!error) return;
      }
      throw credentialsError();
    });
  },

  async listAuthenticators() {
    return guard(async () => {
      const { data, error } = await getSupabase().auth.mfa.listFactors();
      if (error) throw new RepoError('unknown', error.message);
      return (data?.totp ?? []).map((f) => ({
        id: f.id,
        name: f.friendly_name ?? 'Authenticator',
        createdAt: f.created_at,
      }));
    });
  },

  async removeAuthenticator(id) {
    return guard(async () => {
      const list = await auth.listAuthenticators();
      if (list.length <= 1) throw new RepoError('invalid', "You can't remove your only authenticator.");
      const { error } = await getSupabase().auth.mfa.unenroll({ factorId: id });
      if (error) throw new RepoError('unknown', error.message);
    });
  },

  async changePassword(newPassword) {
    return guard(async () => {
      const { error } = await getSupabase().auth.updateUser({ password: newPassword });
      if (error) {
        if (/aal2|reauthent/i.test(error.message)) {
          throw new RepoError('auth', 'Enter your authenticator code first.');
        }
        throw new RepoError('invalid', error.message, 'password');
      }
    });
  },

  async passwordChangeNeedsCode() {
    const client = getSupabase();
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  },

  async requestPasswordReset(email, redirectTo) {
    return guard(async () => {
      // Always "succeeds" from the user's point of view: never reveal whether the email exists.
      await getSupabase().auth.resetPasswordForEmail(email, { redirectTo });
    });
  },

  async signOut(scope) {
    await getSupabase().auth.signOut({ scope });
  },

  async mfaEnforced() {
    const { error } = await db().rpc('is_owner_account');
    return !error;
  },
};

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const data: DataApi = {
  async list(table, options) {
    return guard(async () => {
      let q = db().from(table).select('*');
      if (options?.where) q = q.eq(options.where.column, options.where.value);
      const { data: rows, error } = await q
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) fail(error, table);
      return (rows ?? []) as Row[];
    });
  },

  async get(table, id) {
    return guard(async () => {
      const { data: row, error } = await db().from(table).select('*').eq('id', id).maybeSingle();
      if (error) fail(error, table);
      return (row as Row | null) ?? null;
    });
  },

  async create(table, values) {
    return guard(async () => {
      const { data: row, error } = await db().from(table).insert(values).select('*').single();
      if (error) fail(error, table);
      return row as Row;
    });
  },

  async update(table, id, values, expectedUpdatedAt) {
    return guard(async () => {
      let q = db().from(table).update(values).eq('id', id);
      if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
      const { data: rows, error } = await q.select('*');
      if (error) fail(error, table);
      if (!rows || rows.length === 0) {
        const exists = await data.get(table, id);
        if (!exists) throw mapDbError({ code: 'PGRST116' }, table);
        throw conflictError();
      }
      return rows[0] as Row;
    });
  },

  async remove(table, id) {
    return guard(async () => {
      // a product's private file goes with it (spec 08); its location row cascades
      const file =
        table === 'products'
          ? (await db().from('product_files').select('file_path').eq('product_id', id).maybeSingle()).data
          : null;
      const { data: rows, error } = await db().from(table).delete().eq('id', id).select('id');
      if (error) fail(error, table);
      if (!rows || rows.length === 0) throw mapDbError({ code: '42501' }, table);
      if (file?.file_path) {
        await getSupabase()
          .storage.from('products')
          .remove([String(file.file_path).replace(/^products\//, '')]);
      }
    });
  },

  async reorder(table, ids) {
    return guard(async () => {
      const { error } = await db().rpc('reorder', { p_table: table, p_ids: ids });
      if (error) fail(error, table);
    });
  },

  async getSettings() {
    return guard(async () => {
      const { data: row, error } = await db().from('site_settings').select('*').eq('id', 1).single();
      if (error) fail(error, 'site_settings');
      return row as SettingsRow;
    });
  },

  async updateSettings(values, expectedUpdatedAt) {
    return guard(async () => {
      let q = db().from('site_settings').update(values).eq('id', 1);
      if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
      const { data: rows, error } = await q.select('*');
      if (error) fail(error, 'site_settings');
      if (!rows || rows.length === 0) throw conflictError();
      return rows[0] as SettingsRow;
    });
  },

  async countNewMessages() {
    return guard(async () => {
      const { count, error } = await db()
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new');
      if (error) return 0;
      return count ?? 0;
    });
  },
};

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

function splitPath(path: string): { bucket: Bucket; objectPath: string } {
  const [bucket, ...rest] = path.split('/');
  return { bucket: bucket as Bucket, objectPath: rest.join('/') };
}

const files: FilesApi = {
  async upload(bucket, objectPath, file, { contentType, onProgress, signal }) {
    checkFileForBucket(bucket, file.size, contentType);
    const { data: sessionData } = await getSupabase().auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new RepoError('auth', 'Your session has expired — sign in again.');
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
    const url = `${supabaseUrl()}/storage/v1/object/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;

    // XMLHttpRequest (not fetch) so we get upload progress and can cancel.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', anonKey);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let message = 'Upload failed.';
        try {
          message = (JSON.parse(xhr.responseText) as { message?: string }).message ?? message;
        } catch {
          /* keep default */
        }
        if (xhr.status === 413 || /size/i.test(message))
          reject(new RepoError('file', 'This file is too large.'));
        else if (/mime|type/i.test(message))
          reject(new RepoError('file', "This file type isn't allowed here."));
        else if (xhr.status === 401 || xhr.status === 403)
          reject(new RepoError('auth', 'Your session has expired — sign in again.'));
        else reject(new RepoError('file', message));
      };
      xhr.onerror = () => reject(networkError(new Error('upload failed')));
      xhr.onabort = () => reject(new RepoError('file', 'Upload cancelled.'));
      signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(file);
    });
    onProgress?.(1);
    return `${bucket}/${objectPath}`;
  },

  async remove(paths) {
    const byBucket = new Map<Bucket, string[]>();
    for (const p of paths) {
      if (/^https:\/\//.test(p)) continue;
      const { bucket, objectPath } = splitPath(p);
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), objectPath]);
    }
    for (const [bucket, objectPaths] of byBucket) {
      const { error } = await getSupabase().storage.from(bucket).remove(objectPaths);
      if (error) throw new RepoError('file', `Couldn't delete files: ${error.message}`);
    }
  },

  async listAll(bucket) {
    const out: StoredFile[] = [];
    const walk = async (prefix: string): Promise<void> => {
      for (let offset = 0; ; offset += 1000) {
        const { data: entries, error } = await getSupabase()
          .storage.from(bucket)
          .list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new RepoError('file', error.message);
        for (const e of entries ?? []) {
          const full = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.id === null)
            await walk(full); // folder
          else {
            const meta = (e.metadata ?? {}) as { size?: number; mimetype?: string };
            out.push({
              path: `${bucket}/${full}`,
              size: meta.size ?? 0,
              contentType: meta.mimetype ?? '',
              updatedAt: e.updated_at ?? e.created_at ?? '',
            });
          }
        }
        if (!entries || entries.length < 1000) break;
      }
    };
    await walk('');
    return out;
  },

  url(path) {
    return mediaUrl(path, supabaseUrl());
  },
};

/* ------------------------------------------------------------------ */
/* Messages (spec 07 §2.4)                                             */
/* ------------------------------------------------------------------ */

function messageError(error: DbErrorLike): never {
  if (/fetch|network/i.test(error.message ?? '') && !error.code) throw networkError(error);
  throw new RepoError('unknown', 'Couldn’t update the inbox. Please try again.', undefined, { cause: error });
}

const tabCount = async (tab: MessageTab) => {
  let q = db().from('messages').select('id', { count: 'exact', head: true });
  q = tab === 'all' ? q.neq('status', 'archived') : q.eq('status', tab);
  const { count, error } = await q;
  if (error) messageError(error);
  return count ?? 0;
};

const messages: MessagesApi = {
  async list({ tab, kind, search, limit }) {
    return guard(async () => {
      let q = db()
        .from('messages')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, Math.max(0, limit - 1));
      q = tab === 'all' ? q.neq('status', 'archived') : q.eq('status', tab);
      if (kind) q = q.eq('kind', kind);
      const or = searchFilter(search);
      if (or) q = q.or(or);
      const { data: rows, count, error } = await q;
      if (error) messageError(error);
      return { rows: (rows ?? []) as MessageRow[], total: count ?? 0 };
    });
  },
  async counts() {
    return guard(async () => {
      const entries = await Promise.all(messageTabs.map(async (t) => [t, await tabCount(t)] as const));
      return Object.fromEntries(entries) as Record<MessageTab, number>;
    });
  },
  async get(id) {
    return guard(async () => {
      const { data: row, error } = await db().from('messages').select('*').eq('id', id).maybeSingle();
      if (error) messageError(error);
      return (row as MessageRow | null) ?? null;
    });
  },
  async setStatus(id, status) {
    return guard(async () => {
      const { data: rows, error } = await db().from('messages').update({ status }).eq('id', id).select('id');
      if (error) messageError(error);
      if (!rows?.length) throw new RepoError('not_found', 'This message no longer exists.');
    });
  },
  async remove(id) {
    return guard(async () => {
      const { error } = await db().from('messages').delete().eq('id', id);
      if (error) messageError(error);
    });
  },
};

/* ------------------------------------------------------------------ */
/* Shop (spec 08 §2.4)                                                 */
/* ------------------------------------------------------------------ */

function shopError(error: DbErrorLike | null, what = 'the shop'): never {
  if (error && /fetch|network/i.test(error.message ?? '') && !error.code) throw networkError(error);
  throw new RepoError('unknown', `Couldn’t update ${what}. Please try again.`, undefined, { cause: error });
}

/** Calls the owner-only shop function with your signed-in session. */
async function shopAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('shop-admin', { body });
  if (!error) return data as T;
  const response = (error as { context?: Response }).context;
  const status = response instanceof Response ? response.status : 0;
  let detail: { error?: string; detail?: string; field?: string; code?: string; message?: string } = {};
  try {
    detail = (await response?.clone().json()) ?? {};
  } catch {
    try {
      detail = { message: (await response?.text())?.slice(0, 200) };
    } catch {
      /* no body */
    }
  }
  if (detail?.error === 'provider')
    throw new RepoError(
      'unknown',
      `The payment provider refused the change: ${detail.detail ?? 'no details'}. Check the API key and try again.`,
    );
  if (detail?.error === 'code_taken')
    throw new RepoError('unique', 'That code already exists. Pick another.', 'code');
  if (detail?.error === 'invalid')
    throw new RepoError(
      'invalid',
      'Check the highlighted field.',
      typeof detail.field === 'string' ? detail.field : undefined,
    );
  if (detail?.error === 'not_owner') throw new RepoError('auth', 'Your session has expired — sign in again.');
  if (/fetch|network|Failed to send/i.test(error.message))
    throw new RepoError(
      'network',
      'Couldn’t reach the shop functions. Are they deployed (supabase/README.md, step D3)?',
    );
  throw new RepoError('unknown', shopAdminFailure(status, detail, String(body.action)));
}

/** A readable reason for a shop-admin failure the cases above don't cover. */
export function shopAdminFailure(
  status: number,
  detail: { error?: string; code?: string; message?: string },
  action: string,
): string {
  const deploy = 'Redeploy the shop functions (supabase/README.md, step D3).';
  // an older shop-admin that doesn't know this action yet
  if (detail.error === 'unknown_action')
    return `The deployed shop functions are older than the site (no “${action}”). ${deploy}`;
  if (status === 404 && (detail.code === 'NOT_FOUND' || /not found/i.test(detail.message ?? '')))
    return `The shop-admin function isn’t deployed. ${deploy}`;
  if (detail.code === 'BOOT_ERROR' || /boot|worker/i.test(detail.code ?? ''))
    return `The shop-admin function couldn’t start. ${deploy} Supabase → Edge Functions → shop-admin → Logs shows why.`;
  if (detail.error === 'db')
    return 'The database refused the change. Check that migration 0010 has been run (step D1).';
  const what = [status && `status ${status}`, detail.error ?? detail.code ?? detail.message]
    .filter(Boolean)
    .join(', ');
  return `The shop function failed${what ? ` (${what})` : ''}. Supabase → Edge Functions → shop-admin → Logs shows the details.`;
}

const shop: ShopAdminApi = {
  status: () => shopAdmin({ action: 'status' }),
  async getFile(productId) {
    return guard(async () => {
      const { data: row, error } = await db()
        .from('product_files')
        .select('product_id, file_path, external_url, file_name')
        .eq('product_id', productId)
        .maybeSingle();
      if (error) shopError(error, 'the product file');
      return (row as ProductFileRow | null) ?? null;
    });
  },
  async setFile(productId, file) {
    return guard(async () => {
      if (!file.file_path && !file.external_url) {
        const { error } = await db().from('product_files').delete().eq('product_id', productId);
        if (error) shopError(error, 'the product file');
        return;
      }
      const { error } = await db()
        .from('product_files')
        .upsert({ product_id: productId, ...file }, { onConflict: 'product_id' });
      if (error) {
        if (error.code === '23514')
          throw new RepoError('invalid', 'The link must start with https://', 'external_url');
        shopError(error, 'the product file');
      }
    });
  },
  async sync(productId) {
    const { product } = await shopAdmin<{ product: Row }>({ action: 'sync', product_id: productId });
    return product;
  },
  async orders({ status, productId, search, limit }) {
    return guard(async () => {
      let q = db()
        .from('orders')
        .select(
          'id, product_id, product_title, email, buyer_name, amount, currency, status, provider, provider_payment_id, downloads_used, download_limit, expires_at, refresh_count, created_at',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(0, Math.max(0, limit - 1));
      if (status) q = q.eq('status', status);
      if (productId) q = q.eq('product_id', productId);
      const s = cleanSearch(search);
      if (s) q = q.or(`email.ilike."*${s}*",buyer_name.ilike."*${s}*"`);
      const { data: rows, count, error } = await q;
      if (error) shopError(error, 'orders');
      return { rows: (rows ?? []) as OrderRow[], total: count ?? 0 };
    });
  },
  async updateOrder(id, values) {
    return guard(async () => {
      const { data: rows, error } = await db().from('orders').update(values).eq('id', id).select('id');
      if (error) shopError(error, 'the order');
      if (!rows?.length) throw new RepoError('not_found', 'This order no longer exists.');
    });
  },
  resend: (orderId) => shopAdmin({ action: 'resend', order_id: orderId }),
  async discounts() {
    return (await shopAdmin<{ discounts: DiscountRow[] }>({ action: 'discounts' })).discounts;
  },
  async createDiscount(input) {
    return (await shopAdmin<{ discount: DiscountRow }>({ action: 'create_discount', ...input })).discount;
  },
  async deleteDiscount(id) {
    await shopAdmin({ action: 'delete_discount', id });
  },
  async sales(days) {
    return guard(async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data: rows, error } = await db()
        .from('orders')
        .select('amount, currency')
        .eq('status', 'paid')
        .gte('created_at', since);
      if (error) shopError(error, 'sales');
      const revenue: Record<string, number> = {};
      for (const r of rows ?? [])
        revenue[r.currency as string] = (revenue[r.currency as string] ?? 0) + Number(r.amount);
      return { orders: rows?.length ?? 0, revenue };
    });
  },
  async pages() {
    return guard(async () => {
      const { data: rows, error } = await db().from('shop_pages').select('*').order('slug');
      if (error) shopError(error, 'the policy pages');
      return (rows ?? []) as ShopPageRow[];
    });
  },
  async updatePage(slug, values, expectedUpdatedAt) {
    return guard(async () => {
      let q = db().from('shop_pages').update(values).eq('slug', slug);
      if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
      const { data: rows, error } = await q.select('*');
      if (error) shopError(error, 'the page');
      if (!rows?.length) throw conflictError();
      return rows[0] as ShopPageRow;
    });
  },
};

export const supabaseRepository: AdminRepository = { kind: 'supabase', auth, data, files, messages, shop };
