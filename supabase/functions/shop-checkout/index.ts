/**
 * shop-checkout — starts a purchase (spec 08 CO-1, SH-2).
 * POST { product_id, currency: "USD" | "INR", code? } → { url } (the provider's hosted checkout).
 * The price and product come from the database, never from the browser. `code` is a discount
 * code from a code link (spec 08 DC-4): checked with Dodo first, so a bad one gets a clear message.
 */
import { createCheckout, DISCOUNT_CODE_RE, discountUsable, ProviderError } from '../_shared/dodo.ts';
import { adminDb, dodoEnv, json, readRequest, siteUrl } from '../_shared/runtime.ts';
import { isUuid, randomRef, sha256Hex } from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  const { product_id, currency } = r.body;
  const code = typeof r.body.code === 'string' && r.body.code.trim() ? r.body.code.trim() : null;
  if (!isUuid(product_id) || (currency !== 'USD' && currency !== 'INR'))
    return json(400, { error: 'bad_request' });
  if (code && !DISCOUNT_CODE_RE.test(code)) return json(422, { error: 'code_invalid' });

  const db = adminDb();
  const { data: p } = await db
    .from('products')
    .select(
      'id, slug, is_published, is_free, price_usd, price_inr, provider_product_id, provider_product_id_inr',
    )
    .eq('id', product_id)
    .maybeSingle();
  if (!p || !p.is_published || p.is_free) return json(404, { error: 'not_for_sale' });
  const providerId = currency === 'INR' ? p.provider_product_id_inr : p.provider_product_id;
  if (!providerId || (currency === 'INR' ? p.price_inr == null : p.price_usd == null)) {
    return json(409, { error: 'not_ready' });
  }

  // the buyer's private reference for the thank-you page (CO-3); only its hash leaves here
  const ref = randomRef();
  const dodo = dodoEnv();
  try {
    if (code && !(await discountUsable(dodo, code))) return json(422, { error: 'code_invalid' });
    const { url } = await createCheckout(dodo, {
      providerProductId: providerId,
      siteProductId: p.id,
      refHash: await sha256Hex(ref),
      returnUrl: `${siteUrl()}/shop/thanks?ref=${ref}`,
      cancelUrl: `${siteUrl()}/shop/${p.slug}`,
      discountCode: code,
    });
    return json(200, { url });
  } catch (e) {
    console.error(e);
    // e.g. a code that only works for other products
    if (code && e instanceof ProviderError && e.status >= 400 && e.status < 500)
      return json(422, { error: 'code_invalid' });
    return json(502, { error: 'provider_unavailable' });
  }
});
