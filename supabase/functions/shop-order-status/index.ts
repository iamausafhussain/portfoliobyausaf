/**
 * shop-order-status — the thank-you page asks whether the payment has been confirmed
 * (spec 08 CO-3). POST { ref, payment_id? } → { ready: false }, { ready: true, token, product }
 * or { ready: false, failed: true, product } when the payment didn't go through (CO-3a).
 * The ref is the random value only the buyer's return address contains; Dodo adds the
 * payment_id to that address. A payment is only reported on when its metadata carries this
 * ref's hash, so nobody can look up someone else's payment.
 */
import { getPayment, paymentFailed } from '../_shared/dodo.ts';
import { adminDb, dodoEnv, env, json, readRequest } from '../_shared/runtime.ts';
import { downloadToken, sha256Hex, THANKS_WINDOW_HOURS } from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  const ref = r.body.ref;
  if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ref)) return json(400, { error: 'bad_request' });

  const paymentId = typeof r.body.payment_id === 'string' ? r.body.payment_id : null;
  const refHash = await sha256Hex(ref);
  const db = adminDb();
  const { data: o } = await db
    .from('orders')
    .select('id, product_id, product_title, status, token_version, created_at')
    .eq('ref_hash', refHash)
    .maybeSingle();
  if (!o) {
    if (!paymentId || !/^pay_[A-Za-z0-9]{6,64}$/.test(paymentId)) return json(200, { ready: false });
    try {
      const pay = await getPayment(dodoEnv(), paymentId);
      if (pay.metadata.ref_hash !== refHash || !paymentFailed(pay.status)) return json(200, { ready: false });
      const productId = typeof pay.metadata.product_id === 'string' ? pay.metadata.product_id : null;
      const { data: p } = productId
        ? await db.from('products').select('title, slug, cover').eq('id', productId).maybeSingle()
        : { data: null };
      return json(200, {
        ready: false,
        failed: true,
        product: p ? { title: p.title, slug: p.slug, cover: p.cover } : null,
      });
    } catch (e) {
      // can't ask Dodo right now: keep waiting; the page also reads Dodo's status from the address
      console.error(e);
      return json(200, { ready: false });
    }
  }
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
