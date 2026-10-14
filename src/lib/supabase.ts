/**
 * The one Supabase client for the whole app (spec 01 §3.9).
 *
 * Created lazily so pages that need no data (e.g. /dev/tokens) still work without a .env.
 * Only the public anon key is used here; security is enforced by RLS in the database.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database.types';

export type AppSupabaseClient = SupabaseClient<Database>;

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Validates the two env vars and returns them, or throws a readable error (AC-1.21). */
export function readSupabaseEnv(env: SupabaseEnv): { url: string; anonKey: string } {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean);

  if (missing.length) {
    throw new SupabaseConfigError(
      `Supabase is not configured: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing. ` +
        'Copy .env.example to .env and fill in the values from Supabase → Project Settings → API, ' +
        'then restart the dev server. On Netlify, add them under Site configuration → Environment variables.',
    );
  }
  if (!/^https:\/\/[^\s/]+$/.test(url.replace(/\/+$/, ''))) {
    throw new SupabaseConfigError(
      `VITE_SUPABASE_URL must look like https://<project-id>.supabase.co (got "${url}").`,
    );
  }
  return { url: url.replace(/\/+$/, ''), anonKey };
}

let client: AppSupabaseClient | null = null;

export function getSupabase(): AppSupabaseClient {
  if (client) return client;
  const { url, anonKey } = readSupabaseEnv(import.meta.env);
  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** Public URL of the Supabase project (for building storage URLs). */
export function supabaseUrl(): string {
  return readSupabaseEnv(import.meta.env).url;
}
