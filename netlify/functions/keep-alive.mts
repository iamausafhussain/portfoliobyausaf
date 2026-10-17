/**
 * Netlify scheduled function (spec 09 OP-1, Q6): once a day, calls the database's keep_alive()
 * so the free Supabase project never pauses after a quiet week; it also tidies analytics
 * (daily totals, 13-month retention). Uses only the public key.
 */
declare const Netlify: { env: { get(name: string): string | undefined } };

export default async function handler(): Promise<Response> {
  const url = (Netlify.env.get('VITE_SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY') ?? '';
  if (!url || !key) {
    console.error('keep-alive: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not available to functions');
    return new Response('not configured', { status: 500 });
  }
  const res = await fetch(`${url}/rest/v1/rpc/keep_alive`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  console.log(`keep-alive: ${res.status} ${text.slice(0, 100)}`);
  return new Response(res.ok ? 'ok' : 'failed', { status: res.ok ? 200 : 502 });
}

export const config = { schedule: '@daily' };
