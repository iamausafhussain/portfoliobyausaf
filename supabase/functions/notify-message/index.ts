/**
 * notify-message — emails you each new contact message (spec 07 §2.5).
 *
 * Called by a Supabase database webhook on INSERT into public.messages. Sends through
 * Resend. Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY   your Resend API key
 *   NOTIFY_TO        where the alert goes (your email)
 *   WEBHOOK_SECRET   a long random string; the webhook sends it in the x-webhook-secret header
 *   SITE_URL         e.g. https://your-site.netlify.app (for the "Open in your inbox" link)
 *   NOTIFY_FROM      optional; defaults to Resend's test sender "Portfolio <onboarding@resend.dev>"
 *
 * Deploy with: supabase functions deploy notify-message --no-verify-jwt
 * (the webhook secret is the check; the message is already stored whatever happens here).
 */
import { alertEmail, messageFromPayload, sameSecret } from './format.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('WEBHOOK_SECRET') ?? '';
  if (!sameSecret(req.headers.get('x-webhook-secret') ?? '', secret))
    return json(401, { error: 'unauthorised' });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_TO');
  if (!apiKey || !to) return json(200, { skipped: 'not configured' });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const message = messageFromPayload(payload);
  if (!message) return json(200, { skipped: 'not a new message' });

  const email = alertEmail(message, Deno.env.get('SITE_URL') ?? '');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIFY_FROM') || 'Portfolio <onboarding@resend.dev>',
      to: [to],
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) return json(502, { error: 'send_failed', status: res.status });
  return json(200, { sent: true });
});
