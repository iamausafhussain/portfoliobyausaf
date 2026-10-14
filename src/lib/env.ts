/**
 * Supabase settings from the environment, without importing the Supabase client
 * (the public site reads through the small REST client; see data/source.ts).
 */
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

/** Public URL of the Supabase project (for building storage URLs). */
export function supabaseUrl(): string {
  return readSupabaseEnv(import.meta.env).url;
}
