/**
 * shop-webhook — the payment provider's events (spec 08 CO-2, CO-6, SH-3).
 * Verifies the signature, handles each event once, records paid orders, emails the
 * download link, and marks refunded orders.
 */
import { adminDb, downloadLink, env, json, sendEmail, siteName } from '../_shared/runtime.ts';
import {
  downloadEmail,
  downloadToken,
  expiryFrom,
  readEvent,
  tokenHash,
  verifyWebhook,
} from '../_shared/shop.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const body = await req.text();
  const ok = await verifyWebhook({
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
    body,
    secret: env('DODO_WEBHOOK_SECRET'),
  });
  if (!ok) return json(401, { error: 'bad_signature' });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const event = readEvent(payload);
  const db = adminDb();

  // Handling is once-only by design: an order is keyed on the provider's payment id, and a
  // refund just sets a status. So a repeated event changes nothing (SH-3). The event is logged
  // after it's handled, so a failure part-way lets the provider's retry finish the job.
  const eventId = req.headers.get('webhook-id')!;
  const logEvent = () =>
    db
      .from('shop_events')
      .upsert(
        { event_id: eventId, type: event.kind === 'ignored' ? event.type : event.kind },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );

  if (event.kind === 'refunded') {
    const { error } = await db
      .from('orders')
      .update({ status: 'refunded' })
      .eq('provider_payment_id', event.paymentId);
    if (error) return json(500, { error: 'db' });
    await logEvent();
    return json(200, { refunded: true });
  }
  if (event.kind !== 'paid') {
    await logEvent();
    return json(200, { ignored: event.type });
  }

  const { data: product } = event.productId
    ? await db.from('products').select('id, title').eq('id', event.productId).maybeSingle()
    : { data: null };
  const orderId = crypto.randomUUID();
  const token = await downloadToken(env('SHOP_TOKEN_SECRET'), orderId, 1);
  const { data: created, error } = await db
    .from('orders')
    .upsert(
      {
        id: orderId,
        product_id: product?.id ?? null,
        product_title: product?.title ?? 'Your purchase',
        email: event.email,
        buyer_name: event.name,
        amount: event.amount,
        currency: event.currency,
        status: 'paid',
        provider: 'dodo',
        provider_payment_id: event.paymentId,
        provider_session_id: event.sessionId,
        token_hash: await tokenHash(token),
        ref_hash: event.refHash,
        expires_at: expiryFrom(),
      },
      { onConflict: 'provider_payment_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.error(error);
    return json(500, { error: 'db' });
  }
  // already recorded (a repeated event): don't email twice
  if (!created || created.length === 0) {
    await logEvent();
    return json(200, { duplicate: true });
  }

  await sendEmail(
    event.email,
    downloadEmail({
      productTitle: product?.title ?? 'Your purchase',
      link: downloadLink(token),
      reason: 'purchase',
      siteName: await siteName(db),
    }),
  );
  await logEvent();
  return json(200, { recorded: true });
});
