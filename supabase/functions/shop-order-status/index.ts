/**
 * shop-order-status — the thank-you page asks whether the payment has been confirmed
 * (spec 08 CO-3). POST { ref } → { ready: false } or { ready: true, token, product }.
 * The ref is the random value only the buyer's return address contains.
 */
import { adminDb, env, json, readRequest } from '../_shared/runtime.ts';
import { downloadToken, sha256Hex, THANKS_WINDOW_HOURS } from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  const ref = r.body.ref;
  if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ref)) return json(400, { error: 'bad_request' });

  const db = adminDb();
  const { data: o } = await db
    .from('orders')
    .select('id, product_id, product_title, status, token_version, created_at')
    .eq('ref_hash', await sha256Hex(ref))
    .maybeSingle();
  if (!o) return json(200, { ready: false });
  if (Date.now() - Date.parse(o.created_at) > THANKS_WINDOW_HOURS * 3_600_000 || o.status !== 'paid') {
    return json(200, { ready: false, expired: true });
  }
  const token = await downloadToken(env('SHOP_TOKEN_SECRET'), o.id, o.token_version);
  const { data: p } = o.product_id
    ? await db.from('products').select('slug, cover').eq('id', o.product_id).maybeSingle()
    : { data: null };
  return json(200, {
    ready: true,
    token,
    product: { title: o.product_title, slug: p?.slug ?? null, cover: p?.cover ?? null },
  });
});
