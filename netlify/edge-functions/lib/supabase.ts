/** Reads published content from Supabase with the public key, cached briefly per edge instance. */

declare const Netlify: { env: { get(name: string): string | undefined } };

export function supabaseEnv(): { url: string; key: string } | null {
  const url = (Netlify.env.get('VITE_SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
  const key = (Netlify.env.get('VITE_SUPABASE_ANON_KEY') ?? '').trim();
  return url && key ? { url, key } : null;
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 5 * 60_000;

/** GET /rest/v1/<query>; null on any failure (the page then keeps its built-in tags). */
export async function rest<T>(query: string): Promise<T | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  try {
    const res = await fetch(`${env.url}/rest/v1/${query}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const value = (await res.json()) as T;
    cache.set(query, { at: Date.now(), value });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return value;
  } catch {
    return null;
  }
}

export const one = async <T>(query: string) => ((await rest<T[]>(query)) ?? [])[0] ?? null;
