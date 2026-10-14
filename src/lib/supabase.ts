/**
 * The one Supabase client for the whole app (spec 01 §3.9).
 *
 * Created lazily so pages that need no data (e.g. /dev/tokens) still work without a .env.
 * Only the public anon key is used here; security is enforced by RLS in the database.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../data/database.types';
import { readSupabaseEnv } from './env';

export { readSupabaseEnv, SupabaseConfigError, supabaseUrl, type SupabaseEnv } from './env';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

export function getSupabase(): AppSupabaseClient {
  if (client) return client;
  const { url, anonKey } = readSupabaseEnv(import.meta.env);
  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
