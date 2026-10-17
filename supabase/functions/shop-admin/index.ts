/**
 * shop-admin — owner-only shop actions from the admin (spec 08 AD-8.2, AD-8.4, CO-10).
 * POST (with your signed-in session) { action, ... }:
 *   status                 → which mode is active and what's configured
 *   sync   { product_id }  → create / update the product on the provider, store its ids
 *   resend { order_id }    → a new download link to the buyer (the old link stops working)
 */
import { ProviderError, upsertProduct } from '../_shared/dodo.ts';
import {
  adminDb,
  dodoEnv,
  downloadLink,
  env,
  isOwnerRequest,
  json,
  readRequest,
  sendEmail,
  siteName,
} from '../_shared/runtime.ts';
import { downloadEmail, downloadToken, expiryFrom, isUuid, tokenHash } from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  if (!(await isOwnerRequest(req))) return json(401, { error: 'not_owner' });
  const db = adminDb();
  const action = r.body.action;

  if (action === 'status') {
    return json(200, {
      provider: 'dodo',
      mode: dodoEnv().mode,
      configured: {
        provider: !!env('DODO_API_KEY'),
        webhook: !!env('DODO_WEBHOOK_SECRET'),
        tokens: env('SHOP_TOKEN_SECRET').length >= 32,
        email: !!env('RESEND_API_KEY'),
        site: !!env('SITE_URL'),
      },
    });
  }

  if (action === 'sync') {
    const id = r.body.product_id;
    if (!isUuid(id)) return json(400, { error: 'bad_request' });
    const { data: p } = await db.from('products').select('*').eq('id', id).maybeSingle();
    if (!p) return json(404, { error: 'not_found' });
    if (p.is_free) return json(200, { product: p });
    try {
      const base = { siteProductId: p.id, name: p.title, description: p.tagline || p.title };
      const usd =
        p.price_usd != null
          ? await upsertProduct(dodoEnv(), p.provider_product_id, {
              ...base,
              price: p.price_usd,
              currency: 'USD',
            })
          : p.provider_product_id;
      const inr =
        p.price_inr != null
          ? await upsertProduct(dodoEnv(), p.provider_product_id_inr, {
              ...base,
              price: p.price_inr,
              currency: 'INR',
            })
          : p.provider_product_id_inr;
      const { data: updated, error } = await db
        .from('products')
        .update({ provider_product_id: usd, provider_product_id_inr: inr })
        .eq('id', p.id)
        .select('*')
        .single();
      if (error) return json(500, { error: 'db' });
      return json(200, { product: updated });
    } catch (e) {
      console.error(e);
      return json(502, { error: 'provider', detail: e instanceof ProviderError ? e.message : 'unavailable' });
    }
  }

  if (action === 'resend') {
    const id = r.body.order_id;
    if (!isUuid(id)) return json(400, { error: 'bad_request' });
    const { data: o } = await db.from('orders').select('*').eq('id', id).maybeSingle();
    if (!o) return json(404, { error: 'not_found' });
    if (o.status === 'refunded' || o.status === 'revoked') return json(409, { error: o.status });
    const version = o.token_version + 1;
    const token = await downloadToken(env('SHOP_TOKEN_SECRET'), o.id, version);
    const { error } = await db
      .from('orders')
      .update({
        token_version: version,
        token_hash: await tokenHash(token),
        expires_at: o.expires_at < new Date().toISOString() ? expiryFrom() : o.expires_at,
      })
      .eq('id', o.id);
    if (error) return json(500, { error: 'db' });
    const sent = await sendEmail(
      o.email,
      downloadEmail({
        productTitle: o.product_title,
        link: downloadLink(token),
        reason: 'fresh',
        siteName: await siteName(db),
      }),
    );
    return json(200, { sent });
  }

  return json(400, { error: 'unknown_action' });
});
