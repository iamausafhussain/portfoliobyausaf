/**
 * Deno-side helpers for the shop's Edge Functions: settings, CORS, JSON replies, the
 * server-side database client, owner check and email (spec 08 §3.1).
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   DODO_API_KEY, DODO_WEBHOOK_SECRET, DODO_MODE ("test" or "live")
 *   SHOP_TOKEN_SECRET  (32+ random characters; signs download links)
 *   SITE_URL           (e.g. https://your-site.netlify.app)
 *   RESEND_API_KEY, SHOP_FROM (e.g. "Ausaf Hussain <shop@your-domain.com>")
 * Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY itself.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import type { DodoEnv } from './dodo.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

export const env = (name: string) => Deno.env.get(name) ?? '';

export function siteUrl(): string {
  return env('SITE_URL').replace(/\/+$/, '');
}

export function dodoEnv(): DodoEnv {
  return { apiKey: env('DODO_API_KEY'), mode: env('DODO_MODE') === 'live' ? 'live' : 'test' };
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Handles the browser's pre-flight, rejects anything but POST, and reads the JSON body. */
export async function readRequest(
  req: Request,
): Promise<{ early: Response } | { body: Record<string, unknown> }> {
  if (req.method === 'OPTIONS') return { early: new Response('ok', { headers: cors }) };
  if (req.method !== 'POST') return { early: json(405, { error: 'method_not_allowed' }) };
  try {
    const body = await req.json();
    return { body: body && typeof body === 'object' ? (body as Record<string, unknown>) : {} };
  } catch {
    return { early: json(400, { error: 'bad_json' }) };
  }
}

/** The server-side client: bypasses Row Level Security, so only these functions use it. */
export function adminDb(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when the request comes from the signed-in owner (with two-factor), using the database's own check. */
export async function isOwnerRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const userDb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userDb.rpc('is_owner');
  return !error && data === true;
}

export async function siteName(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('site_settings').select('display_name').eq('id', 1).maybeSingle();
  return (data?.display_name as string | undefined) || 'Portfolio';
}

/** Sends an email through Resend; returns false (never throws) when it couldn't. */
export async function sendEmail(
  to: string,
  mail: { subject: string; text: string; html: string },
): Promise<boolean> {
  const key = env('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('SHOP_FROM') || 'Portfolio <onboarding@resend.dev>',
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const downloadLink = (token: string) => `${siteUrl()}/d/${token}`;
