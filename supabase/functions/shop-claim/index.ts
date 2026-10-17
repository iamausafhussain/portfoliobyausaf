/**
 * shop-claim — free products (spec 08 CO-9): the link goes to the email given, so only
 * the owner of that inbox can download. POST { product_id, email, name? } → { sent }.
 */
import { adminDb, downloadLink, env, json, readRequest, sendEmail, siteName } from '../_shared/runtime.ts';
import {
  downloadEmail,
  downloadToken,
  EMAIL_RE,
  expiryFrom,
  FREE_PER_DAY,
  FREE_PER_EMAIL_PER_DAY,
  isUuid,
  tokenHash,
} from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  const { product_id } = r.body;
  const email = String(r.body.email ?? '')
    .trim()
    .toLowerCase();
  const name = String(r.body.name ?? '')
    .trim()
    .slice(0, 120);
  if (!isUuid(product_id) || !EMAIL_RE.test(email) || email.length > 254)
    return json(400, { error: 'bad_request' });

  const db = adminDb();
  const { data: p } = await db
    .from('products')
    .select('id, title, is_free, is_published')
    .eq('id', product_id)
    .maybeSingle();
  if (!p || !p.is_published || !p.is_free) return json(404, { error: 'not_free' });

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'free')
      .eq('email', email)
      .gte('created_at', since),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'free')
      .gte('created_at', since),
  ]);
  if ((mine ?? 0) >= FREE_PER_EMAIL_PER_DAY || (all ?? 0) >= FREE_PER_DAY)
    return json(429, { error: 'rate_limited' });

  const orderId = crypto.randomUUID();
  const token = await downloadToken(env('SHOP_TOKEN_SECRET'), orderId, 1);
  const { error } = await db.from('orders').insert({
    id: orderId,
    product_id: p.id,
    product_title: p.title,
    email,
    buyer_name: name,
    amount: 0,
    currency: 'USD',
    status: 'free',
    provider: 'free',
    token_hash: await tokenHash(token),
    expires_at: expiryFrom(),
  });
  if (error) return json(500, { error: 'db' });
  const sent = await sendEmail(
    email,
    downloadEmail({
      productTitle: p.title,
      link: downloadLink(token),
      reason: 'free',
      siteName: await siteName(db),
    }),
  );
  return json(200, { sent });
});
