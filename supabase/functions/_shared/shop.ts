/**
 * Shop logic shared by the Edge Functions (spec 08 §2.3, §3). Plain TypeScript with Web
 * Crypto only, so it runs in Deno (Supabase Edge Functions) and in the unit tests (Node).
 */

/* ------------------------------------------------------------------ */
/* Bytes and hashes                                                    */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const base64Url = (bytes: ArrayBuffer | Uint8Array) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmac(key: Uint8Array, message: string): Promise<ArrayBuffer> {
  // (a plain byte array; the cast satisfies the stricter browser typings)
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

/** Constant-time string comparison. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 32 random bytes, URL-safe (the thank-you page reference, CO-3). */
export function randomRef(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/* ------------------------------------------------------------------ */
/* Download tokens (CO-5, SH-4)                                        */
/* ------------------------------------------------------------------ */

/**
 * A buyer's download token: derived from a server-only secret, the order and a version.
 * The database keeps only its hash; bumping the version cancels the old link.
 */
export async function downloadToken(secret: string, orderId: string, version: number): Promise<string> {
  if (secret.length < 32) throw new Error('SHOP_TOKEN_SECRET must be at least 32 characters');
  return base64Url(await hmac(enc.encode(secret), `download.${orderId}.${version}`));
}

export const tokenHash = (token: string) => sha256Hex(token);

/** Tokens are 43 URL-safe characters; anything else is rejected before touching the database. */
export const looksLikeToken = (t: unknown): t is string =>
  typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

/* ------------------------------------------------------------------ */
/* Download limits (CO-5)                                              */
/* ------------------------------------------------------------------ */

export const DOWNLOAD_LIMIT = 5;
export const DOWNLOAD_DAYS = 30;
export const MAX_REFRESHES = 3;
export const SIGNED_URL_SECONDS = 60;
/** The thank-you page can fetch the link for this long after the order (CO-3). */
export const THANKS_WINDOW_HOURS = 24;

export interface OrderState {
  status: 'paid' | 'free' | 'refunded' | 'revoked';
  downloads_used: number;
  download_limit: number;
  expires_at: string;
  refresh_count: number;
}

export type DownloadBlock = 'refunded' | 'revoked' | 'expired' | 'used_up' | null;

export function downloadBlock(o: OrderState, now = Date.now()): DownloadBlock {
  if (o.status === 'refunded') return 'refunded';
  if (o.status === 'revoked') return 'revoked';
  if (Date.parse(o.expires_at) <= now) return 'expired';
  if (o.downloads_used >= o.download_limit) return 'used_up';
  return null;
}

/** A fresh link (sent to the buyer's email) once the old one has run out (CO-5). */
export function canRefresh(o: OrderState, now = Date.now()): boolean {
  const b = downloadBlock(o, now);
  return (b === 'expired' || b === 'used_up') && o.refresh_count < MAX_REFRESHES;
}

export const downloadsLeft = (o: OrderState) => Math.max(0, o.download_limit - o.downloads_used);

export const expiryFrom = (now = Date.now()) => new Date(now + DOWNLOAD_DAYS * 86_400_000).toISOString();

/** "b•••@example.com" for showing which inbox a link went to. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export type Currency = 'USD' | 'INR';

export function formatPrice(amount: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

/* ------------------------------------------------------------------ */
/* Standard Webhooks signatures (Dodo Payments, CO-2, SH-3)            */
/* ------------------------------------------------------------------ */

export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Checks a Standard Webhooks signature: HMAC-SHA256 of "<id>.<timestamp>.<raw body>" with the
 * secret (base64 after the "whsec_" prefix), base64-encoded, sent as "v1,<sig>" entries.
 */
export async function verifyWebhook(args: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  now?: number;
}): Promise<boolean> {
  const { id, timestamp, signature, body, secret } = args;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  const now = Math.floor((args.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let key: Uint8Array;
  try {
    key = secret.startsWith('whsec_') ? fromBase64(secret.slice(6)) : enc.encode(secret);
  } catch {
    return false;
  }
  const expected = toBase64(await hmac(key, `${id}.${timestamp}.${body}`));
  return signature
    .split(' ')
    .map((part) => part.split(','))
    .some(([version, sig]) => version === 'v1' && typeof sig === 'string' && sameText(sig, expected));
}

/** Signs like the provider does (used by the tests and the local webhook check). */
export async function signWebhook(
  id: string,
  timestamp: string,
  body: string,
  secret: string,
): Promise<string> {
  const key = secret.startsWith('whsec_') ? fromBase64(secret.slice(6)) : enc.encode(secret);
  return `v1,${toBase64(await hmac(key, `${id}.${timestamp}.${body}`))}`;
}

/* ------------------------------------------------------------------ */
/* Provider events (Dodo Payments)                                     */
/* ------------------------------------------------------------------ */

export type ShopEvent =
  | {
      kind: 'paid';
      paymentId: string;
      sessionId: string | null;
      email: string;
      name: string;
      amount: number;
      currency: string;
      productId: string | null;
      refHash: string | null;
    }
  | { kind: 'refunded'; paymentId: string }
  | { kind: 'ignored'; type: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Reads a webhook body into the two events the shop acts on. */
export function readEvent(payload: unknown): ShopEvent {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const type = str(p.type);
  const d = (p.data && typeof p.data === 'object' ? p.data : {}) as Record<string, unknown>;
  if (type === 'payment.succeeded') {
    const customer = (d.customer && typeof d.customer === 'object' ? d.customer : {}) as Record<
      string,
      unknown
    >;
    const meta = (d.metadata && typeof d.metadata === 'object' ? d.metadata : {}) as Record<string, unknown>;
    const paymentId = str(d.payment_id);
    const email = str(customer.email).trim().toLowerCase();
    if (!paymentId || !email) return { kind: 'ignored', type };
    const refHash = str(meta.ref_hash);
    return {
      kind: 'paid',
      paymentId,
      sessionId: str(d.checkout_session_id) || null,
      email,
      name: str(customer.name).slice(0, 120),
      amount: typeof d.total_amount === 'number' ? Math.max(0, Math.round(d.total_amount)) : 0,
      currency: /^[A-Z]{3}$/.test(str(d.currency)) ? str(d.currency) : 'USD',
      productId: /^[0-9a-f-]{36}$/.test(str(meta.product_id)) ? str(meta.product_id) : null,
      refHash: /^[0-9a-f]{64}$/.test(refHash) ? refHash : null,
    };
  }
  // a refund, or a card dispute the seller lost (the money went back either way)
  if (
    type === 'refund.succeeded' ||
    type === 'dispute.lost' ||
    (str(d.payload_type) === 'Refund' && str(d.status) === 'succeeded')
  ) {
    const paymentId = str(d.payment_id);
    return paymentId ? { kind: 'refunded', paymentId } : { kind: 'ignored', type };
  }
  return { kind: 'ignored', type };
}

/* ------------------------------------------------------------------ */
/* Emails to buyers (CO-4)                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function downloadEmail(args: {
  productTitle: string;
  link: string;
  reason: 'purchase' | 'free' | 'fresh';
  siteName: string;
}): { subject: string; text: string; html: string } {
  const title = args.productTitle.replace(/[\r\n]+/g, ' ').trim();
  const lead =
    args.reason === 'fresh'
      ? 'Here is a fresh download link.'
      : args.reason === 'free'
        ? 'Thanks for grabbing this. Here is your download.'
        : 'Thanks for your purchase. Here is your download.';
  const limits = `The link works ${DOWNLOAD_LIMIT} times within ${DOWNLOAD_DAYS} days. Keep this email; if the link runs out, the download page can send you a fresh one.`;
  const text = [lead, '', `${title}`, args.link, '', limits, '', `— ${args.siteName}`].join('\n');
  const html = [
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:520px">',
    `<p>${escapeHtml(lead)}</p>`,
    '<div style="border:1px dashed #999;border-radius:10px;padding:16px 18px;margin:18px 0">',
    '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#666">Admit one</div>',
    `<div style="font-size:20px;font-style:italic;margin:6px 0 14px">${escapeHtml(title)}</div>`,
    `<a href="${escapeHtml(args.link)}" style="display:inline-block;background:#e8642c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">Download</a>`,
    '</div>',
    `<p style="color:#555;font-size:13px">${escapeHtml(limits)}</p>`,
    `<p style="color:#555;font-size:13px">— ${escapeHtml(args.siteName)}</p>`,
    '</div>',
  ].join('');
  return { subject: `Your download: ${title}`.slice(0, 180), text, html };
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Free downloads: at most this many per email and for the whole site per day (CO-9). */
export const FREE_PER_EMAIL_PER_DAY = 5;
export const FREE_PER_DAY = 200;
