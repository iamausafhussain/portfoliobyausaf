/**
 * shop-download — the download page (spec 08 CO-5, SH-4).
 * POST { token, action: "info" | "download" | "refresh" }
 *   info     → the product, downloads left, expiry, whether a fresh link can be sent
 *   download → counts one download and returns a 60-second link (or the external link)
 *   refresh  → once the link has run out: a new link to the buyer's email
 */
import { adminDb, downloadLink, env, json, readRequest, sendEmail, siteName } from '../_shared/runtime.ts';
import {
  canRefresh,
  downloadBlock,
  downloadEmail,
  downloadsLeft,
  downloadToken,
  expiryFrom,
  looksLikeToken,
  maskEmail,
  SIGNED_URL_SECONDS,
  tokenHash,
} from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  const r = await readRequest(req);
  if ('early' in r) return r.early;
  const { token, action } = r.body;
  if (!looksLikeToken(token) || !['info', 'download', 'refresh'].includes(String(action))) {
    return json(400, { error: 'bad_request' });
  }
  const db = adminDb();
  const { data: o } = await db
    .from('orders')
    .select('*')
    .eq('token_hash', await tokenHash(token))
    .maybeSingle();
  if (!o) return json(404, { error: 'not_found' });
  const { data: p } = o.product_id
    ? await db
        .from('products')
        .select('slug, cover, file_format, file_size, version')
        .eq('id', o.product_id)
        .maybeSingle()
    : { data: null };

  if (action === 'info') {
    return json(200, {
      product: {
        title: o.product_title,
        slug: p?.slug ?? null,
        cover: p?.cover ?? null,
        format: p?.file_format ?? '',
        size: p?.file_size ?? null,
        version: p?.version ?? '',
      },
      status: o.status,
      block: downloadBlock(o),
      left: downloadsLeft(o),
      expires_at: o.expires_at,
      can_refresh: canRefresh(o),
      email: maskEmail(o.email),
    });
  }

  if (action === 'refresh') {
    if (!canRefresh(o)) return json(409, { error: 'cannot_refresh', block: downloadBlock(o) });
    const version = o.token_version + 1;
    const fresh = await downloadToken(env('SHOP_TOKEN_SECRET'), o.id, version);
    const { error } = await db
      .from('orders')
      .update({
        token_version: version,
        token_hash: await tokenHash(fresh),
        downloads_used: 0,
        expires_at: expiryFrom(),
        refresh_count: o.refresh_count + 1,
      })
      .eq('id', o.id)
      .eq('token_version', o.token_version);
    if (error) return json(500, { error: 'db' });
    const sent = await sendEmail(
      o.email,
      downloadEmail({
        productTitle: o.product_title,
        link: downloadLink(fresh),
        reason: 'fresh',
        siteName: await siteName(db),
      }),
    );
    return json(200, { sent, email: maskEmail(o.email) });
  }

  // download
  const block = downloadBlock(o);
  if (block) return json(403, { error: block, can_refresh: canRefresh(o) });
  const { data: f } = o.product_id
    ? await db
        .from('product_files')
        .select('file_path, external_url, file_name')
        .eq('product_id', o.product_id)
        .maybeSingle()
    : { data: null };
  if (!f || (!f.file_path && !f.external_url)) return json(410, { error: 'file_missing' });

  // count it (only if still under the limit, so two clicks at once can't go over)
  const { data: counted } = await db
    .from('orders')
    .update({ downloads_used: o.downloads_used + 1 })
    .eq('id', o.id)
    .eq('downloads_used', o.downloads_used)
    .select('id');
  if (!counted || counted.length === 0) return json(409, { error: 'busy' });

  if (f.external_url) return json(200, { url: f.external_url, left: downloadsLeft(o) - 1 });
  const objectPath = f.file_path.replace(/^products\//, '');
  const { data: signed, error } = await db.storage
    .from('products')
    .createSignedUrl(objectPath, SIGNED_URL_SECONDS, { download: f.file_name || true });
  if (error || !signed) return json(500, { error: 'storage' });
  return json(200, { url: signed.signedUrl, left: downloadsLeft(o) - 1 });
});
