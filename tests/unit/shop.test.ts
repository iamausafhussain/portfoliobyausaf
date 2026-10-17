/** Spec 08 task 8.13: webhook signatures, events, tokens, limits, prices, provider bodies, emails. */
import { describe, expect, it } from 'vitest';
import {
  checkoutBody,
  createCheckout,
  dodoBase,
  productBody,
  upsertProduct,
} from '../../supabase/functions/_shared/dodo';
import {
  canRefresh,
  downloadBlock,
  downloadEmail,
  downloadsLeft,
  downloadToken,
  formatPrice,
  looksLikeToken,
  maskEmail,
  MAX_REFRESHES,
  readEvent,
  sha256Hex,
  signWebhook,
  tokenHash,
  verifyWebhook,
  type OrderState,
} from '../../supabase/functions/_shared/shop';

describe('Standard Webhooks signatures (CO-2, SH-3)', () => {
  // the published test vector from the Standard Webhooks specification
  const vector = {
    secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    timestamp: '1614265330',
    body: '{"test": 2432232314}',
    signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
  };
  const now = 1614265330 * 1000;

  it('matches the reference signature', async () => {
    expect(await signWebhook(vector.id, vector.timestamp, vector.body, vector.secret)).toBe(vector.signature);
    expect(await verifyWebhook({ ...vector, now })).toBe(true);
  });

  it('accepts any v1 entry among several', async () => {
    expect(await verifyWebhook({ ...vector, signature: `v1,bogus= ${vector.signature}`, now })).toBe(true);
  });

  it('refuses tampering, wrong secrets, missing headers and stale timestamps', async () => {
    expect(await verifyWebhook({ ...vector, body: '{"test": 1}', now })).toBe(false);
    expect(await verifyWebhook({ ...vector, secret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', now })).toBe(
      false,
    );
    expect(await verifyWebhook({ ...vector, signature: 'v2,' + vector.signature.slice(3), now })).toBe(false);
    expect(await verifyWebhook({ ...vector, id: null, now })).toBe(false);
    expect(await verifyWebhook({ ...vector, signature: null, now })).toBe(false);
    expect(await verifyWebhook({ ...vector, secret: '', now })).toBe(false);
    expect(await verifyWebhook({ ...vector, now: now + 301_000 })).toBe(false);
    expect(await verifyWebhook({ ...vector, now: now - 301_000 })).toBe(false);
    expect(await verifyWebhook({ ...vector, now: now + 299_000 })).toBe(true);
    expect(await verifyWebhook({ ...vector, timestamp: 'soon', now })).toBe(false);
  });
});

describe('provider events', () => {
  const ref = 'a'.repeat(64);
  const paid = {
    business_id: 'bus_1',
    type: 'payment.succeeded',
    timestamp: '2026-10-17T10:00:00Z',
    data: {
      payload_type: 'Payment',
      payment_id: 'pay_123',
      checkout_session_id: 'cks_9',
      total_amount: 1900,
      currency: 'USD',
      customer: { customer_id: 'cus_1', email: ' Buyer@Example.com ', name: 'Asha' },
      metadata: { product_id: 'a8000000-0000-4000-8000-000000000001', ref_hash: ref },
    },
  };

  it('reads a successful payment', () => {
    expect(readEvent(paid)).toEqual({
      kind: 'paid',
      paymentId: 'pay_123',
      sessionId: 'cks_9',
      email: 'buyer@example.com',
      name: 'Asha',
      amount: 1900,
      currency: 'USD',
      productId: 'a8000000-0000-4000-8000-000000000001',
      refHash: ref,
    });
  });

  it('drops malformed metadata rather than trusting it', () => {
    const e = readEvent({
      ...paid,
      data: { ...paid.data, metadata: { product_id: "1'; drop table", ref_hash: 'x' } },
    });
    expect(e).toMatchObject({ kind: 'paid', productId: null, refHash: null });
    expect(readEvent({ ...paid, data: { ...paid.data, currency: 'usd!' } })).toMatchObject({
      currency: 'USD',
    });
    expect(readEvent({ ...paid, data: { ...paid.data, total_amount: '19' } })).toMatchObject({ amount: 0 });
  });

  it('reads refunds and ignores everything else', () => {
    expect(
      readEvent({ type: 'refund.succeeded', data: { payload_type: 'Refund', payment_id: 'pay_123' } }),
    ).toEqual({
      kind: 'refunded',
      paymentId: 'pay_123',
    });
    expect(
      readEvent({ type: 'dispute.lost', data: { payload_type: 'Dispute', payment_id: 'pay_9' } }),
    ).toEqual({
      kind: 'refunded',
      paymentId: 'pay_9',
    });
    expect(readEvent({ type: 'payment.failed', data: {} })).toEqual({
      kind: 'ignored',
      type: 'payment.failed',
    });
    expect(readEvent({ type: 'payment.succeeded', data: { payment_id: 'p' } })).toEqual({
      kind: 'ignored',
      type: 'payment.succeeded',
    });
    expect(readEvent(null)).toEqual({ kind: 'ignored', type: '' });
  });
});

describe('download tokens (CO-5, SH-4)', () => {
  const secret = 's'.repeat(40);
  const order = 'a8100000-0000-4000-8000-000000000001';

  it('derives a stable, URL-safe token per order and version', async () => {
    const t1 = await downloadToken(secret, order, 1);
    expect(looksLikeToken(t1)).toBe(true);
    expect(await downloadToken(secret, order, 1)).toBe(t1);
    expect(await downloadToken(secret, order, 2)).not.toBe(t1);
    expect(await downloadToken(secret, 'a8100000-0000-4000-8000-000000000002', 1)).not.toBe(t1);
    expect(await downloadToken('t'.repeat(40), order, 1)).not.toBe(t1);
    expect(await tokenHash(t1)).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenHash(t1)).toBe(await sha256Hex(t1));
  });

  it('refuses short secrets and odd-looking tokens', async () => {
    await expect(downloadToken('short', order, 1)).rejects.toThrow(/32 characters/);
    expect(looksLikeToken('abc')).toBe(false);
    expect(looksLikeToken('a'.repeat(42) + '!')).toBe(false);
    expect(looksLikeToken(undefined)).toBe(false);
  });
});

describe('download limits (CO-5, CO-6)', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const base: OrderState = {
    status: 'paid',
    downloads_used: 0,
    download_limit: 5,
    expires_at: '2026-11-16T12:00:00Z',
    refresh_count: 0,
  };

  it('allows downloads within the limit and the time', () => {
    expect(downloadBlock(base, now)).toBeNull();
    expect(downloadsLeft({ ...base, downloads_used: 3 })).toBe(2);
    expect(downloadBlock({ ...base, status: 'free' }, now)).toBeNull();
  });

  it('blocks refunded, revoked, expired and used-up links', () => {
    expect(downloadBlock({ ...base, status: 'refunded' }, now)).toBe('refunded');
    expect(downloadBlock({ ...base, status: 'revoked' }, now)).toBe('revoked');
    expect(downloadBlock({ ...base, expires_at: '2026-10-17T11:59:59Z' }, now)).toBe('expired');
    expect(downloadBlock({ ...base, downloads_used: 5 }, now)).toBe('used_up');
    expect(downloadsLeft({ ...base, downloads_used: 7 })).toBe(0);
  });

  it('offers a fresh link only when it ran out, a few times at most', () => {
    expect(canRefresh(base, now)).toBe(false);
    expect(canRefresh({ ...base, downloads_used: 5 }, now)).toBe(true);
    expect(canRefresh({ ...base, expires_at: '2026-10-01T00:00:00Z' }, now)).toBe(true);
    expect(canRefresh({ ...base, downloads_used: 5, refresh_count: MAX_REFRESHES }, now)).toBe(false);
    expect(canRefresh({ ...base, status: 'refunded', downloads_used: 5 }, now)).toBe(false);
  });

  it('masks the email it was sent to', () => {
    expect(maskEmail('buyer@example.com')).toBe('b•••@example.com');
  });
});

describe('prices (BX-5)', () => {
  it('formats USD and INR', () => {
    expect(formatPrice(1900, 'USD')).toBe('$19');
    expect(formatPrice(1950, 'USD')).toBe('$19.50');
    expect(formatPrice(149900, 'INR')).toBe('₹1,499');
    expect(formatPrice(10000000, 'INR')).toBe('₹1,00,000');
  });
});

describe('Dodo adapter (CO-1, AD-8.2)', () => {
  it('builds one-time digital product bodies', () => {
    expect(
      productBody({
        siteProductId: 'p1',
        name: 'x'.repeat(150),
        description: '',
        price: 1900,
        currency: 'USD',
      }),
    ).toEqual({
      name: 'x'.repeat(100),
      description: null,
      tax_category: 'digital_products',
      price: { type: 'one_time_price', price: 1900, currency: 'USD', purchasing_power_parity: false },
      metadata: { site_product_id: 'p1', currency: 'USD' },
    });
  });

  it('builds checkout sessions with only server-side values', () => {
    expect(
      checkoutBody({
        providerProductId: 'pdt_1',
        siteProductId: 'p1',
        refHash: 'h',
        returnUrl: 'https://site/shop/thanks?ref=r',
      }),
    ).toEqual({
      product_cart: [{ product_id: 'pdt_1', quantity: 1 }],
      return_url: 'https://site/shop/thanks?ref=r',
      metadata: { product_id: 'p1', ref_hash: 'h' },
      feature_flags: { allow_discount_code: true },
    });
  });

  it('talks to the right mode, creates then updates, and reports failures', async () => {
    expect(dodoBase('test')).toBe('https://test.dodopayments.com');
    expect(dodoBase('live')).toBe('https://live.dodopayments.com');
    const calls: { url: string; method: string; auth: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method!,
        auth: (init.headers as Record<string, string>).Authorization!,
      });
      if (url.endsWith('/products')) return new Response(JSON.stringify({ product_id: 'pdt_new' }));
      if (url.endsWith('/checkouts'))
        return new Response(
          JSON.stringify({ session_id: 'cks_1', checkout_url: 'https://checkout.example/1' }),
        );
      if (url.endsWith('/products/pdt_gone')) return new Response('not found', { status: 404 });
      if (url.includes('/products/')) return new Response('{}');
      return new Response('nope', { status: 500 });
    }) as unknown as typeof fetch;
    const env = { apiKey: 'key_1', mode: 'test' as const, fetch: fakeFetch };
    const product = {
      siteProductId: 'p1',
      name: 'LUTs',
      description: 'd',
      price: 1900,
      currency: 'USD' as const,
    };
    expect(await upsertProduct(env, null, product)).toBe('pdt_new');
    expect(await upsertProduct(env, 'pdt_old', product)).toBe('pdt_old');
    expect(
      await createCheckout(env, {
        providerProductId: 'pdt_new',
        siteProductId: 'p1',
        refHash: 'h',
        returnUrl: 'r',
      }),
    ).toEqual({
      url: 'https://checkout.example/1',
      sessionId: 'cks_1',
    });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://test.dodopayments.com/products',
      'PATCH https://test.dodopayments.com/products/pdt_old',
      'POST https://test.dodopayments.com/checkouts',
    ]);
    expect(calls.every((c) => c.auth === 'Bearer key_1')).toBe(true);

    const failing = {
      ...env,
      fetch: (async () => new Response('bad key', { status: 401 })) as unknown as typeof fetch,
    };
    await expect(upsertProduct(failing, null, product)).rejects.toThrow(/401/);
    await expect(upsertProduct(failing, 'pdt_old', product)).rejects.toThrow(/401/);
    // an id Dodo doesn't know (e.g. from test mode, after going live) is created afresh
    calls.length = 0;
    expect(await upsertProduct(env, 'pdt_gone', product)).toBe('pdt_new');
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'POST']);
  });
});

describe('buyer emails (CO-4)', () => {
  it('writes a safe email with the link and the limits', () => {
    const e = downloadEmail({
      productTitle: 'LUTs <b>pack</b>\nnew line',
      link: 'https://site.dev/d/abc',
      reason: 'purchase',
      siteName: 'Ausaf Hussain',
    });
    expect(e.subject).toBe('Your download: LUTs <b>pack</b> new line');
    expect(e.text).toContain('https://site.dev/d/abc');
    expect(e.text).toContain('5 times within 30 days');
    expect(e.html).not.toContain('<b>pack</b>');
    expect(e.html).toContain('&lt;b&gt;pack&lt;/b&gt;');
    expect(downloadEmail({ productTitle: 'x', link: 'l', reason: 'fresh', siteName: 's' }).text).toMatch(
      /fresh download link/,
    );
  });
});

describe('admin: prices, provider sync and order text', async () => {
  const { toMinor, fromMinor, needsSync } = await import('../../src/admin/shop/products');
  const { downloadsText } = await import('../../src/admin/shop/OrdersPage');

  it('reads prices as cents / paise and writes them back', () => {
    expect(toMinor('19')).toBe(1900);
    expect(toMinor('12.5')).toBe(1250);
    expect(toMinor('1,499')).toBe(149900);
    expect(toMinor('')).toBeNull();
    expect(toMinor('12.345')).toBeNaN();
    expect(toMinor('abc')).toBeNaN();
    expect(fromMinor(1900)).toBe('19');
    expect(fromMinor(1250)).toBe('12.50');
    expect(fromMinor(null)).toBe('');
  });

  it('syncs every paid product on save, never free ones', () => {
    const base = { id: '1', updated_at: '', is_free: false, price_usd: 900 };
    expect(needsSync(base)).toBe(true);
    expect(needsSync({ ...base, is_free: true })).toBe(false);
    expect(needsSync({ ...base, price_usd: null })).toBe(false);
  });

  it('describes an order’s downloads', () => {
    const o = {
      status: 'paid',
      downloads_used: 2,
      download_limit: 5,
      expires_at: '2026-11-16T00:00:00Z',
    } as Parameters<typeof downloadsText>[0];
    expect(downloadsText(o, Date.parse('2026-10-17'))).toMatch(/^2 of 5 downloads used · until /);
    expect(downloadsText(o, Date.parse('2026-12-01'))).toBe('2 of 5 downloads used · expired');
    expect(downloadsText({ ...o, status: 'refunded' })).toBe('Link stopped');
  });
});

describe('payment failures and discount codes (spec 08 CO-3a, DC)', async () => {
  const dodo = await import('../../supabase/functions/_shared/dodo');
  const { codeFromSearch } = await import('../../src/data/shop');
  const { discountState, productsFor, codeLink, endOfDay } =
    await import('../../src/admin/shop/DiscountsPage');

  it('applies a code and adds the back button to the checkout', () => {
    expect(
      dodo.checkoutBody({
        providerProductId: 'pdt_1',
        siteProductId: 'p1',
        refHash: 'h',
        returnUrl: 'r',
        cancelUrl: 'https://site/shop/luts',
        discountCode: 'DIWALI20',
      }),
    ).toMatchObject({ cancel_url: 'https://site/shop/luts', discount_codes: ['DIWALI20'] });
    expect(
      dodo.checkoutBody({ providerProductId: 'p', siteProductId: 's', refHash: 'h', returnUrl: 'r' }),
    ).not.toHaveProperty('discount_codes');
  });

  it('knows which payment statuses mean "failed"', () => {
    for (const s of ['failed', 'cancelled', 'requires_payment_method'])
      expect(dodo.paymentFailed(s)).toBe(true);
    for (const s of ['succeeded', 'processing', 'requires_customer_action', null])
      expect(dodo.paymentFailed(s)).toBe(false);
  });

  it('reads payments and discounts with GET requests that carry no body', async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, body: init.body });
      if (url.includes('/payments/'))
        return new Response(JSON.stringify({ status: 'failed', metadata: { ref_hash: 'h' } }));
      if (url.includes('/discounts/code/GONE')) return new Response('expired', { status: 422 });
      if (url.includes('/discounts/code/')) return new Response('{}');
      if (url.includes('/discounts?'))
        return new Response(
          JSON.stringify({
            items: [
              {
                discount_id: 'd1',
                code: 'A20',
                type: 'percentage',
                amount: 2000,
                times_used: 3,
                created_at: 'x',
              },
              { discount_id: 'd2', code: 'FLAT', type: 'flat', amount: 1, created_at: 'y' },
            ],
          }),
        );
      if (init.method === 'DELETE') return new Response('', { status: 404 });
      return new Response('nope', { status: 500 });
    }) as unknown as typeof globalThis.fetch;
    const env = { apiKey: 'k', mode: 'test' as const, fetch };
    expect(await dodo.getPayment(env, 'pay_1')).toEqual({ status: 'failed', metadata: { ref_hash: 'h' } });
    expect(await dodo.discountUsable(env, 'ok20')).toBe(true);
    expect(await dodo.discountUsable(env, 'gone')).toBe(false);
    const list = await dodo.listDiscounts(env);
    expect(list.map((d) => [d.code, d.kind, d.percent, d.timesUsed])).toEqual([
      ['A20', 'percentage', 20, 3],
      ['FLAT', 'flat', 0, 0],
    ]);
    await dodo.deleteDiscount(env, 'd1'); // 404 = already gone, fine
    expect(calls.filter((c) => c.method !== 'POST').every((c) => c.body === undefined)).toBe(true);
  });

  it('checks a new code and turns it into Dodo’s body', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const ok = dodo.parseNewDiscount({
      code: 'diwali20',
      percent: 20,
      usage_limit: 50,
      expires_at: future,
      restricted_to: ['pdt_1'],
    });
    expect(ok).toMatchObject({ code: 'diwali20', percent: 20, usageLimit: 50, restrictedTo: ['pdt_1'] });
    expect(dodo.discountBody(ok as never)).toEqual({
      type: 'percentage',
      amount: 2000,
      code: 'DIWALI20',
      usage_limit: 50,
      expires_at: future,
      restricted_to: ['pdt_1'],
    });
    expect(
      dodo.discountBody({ code: '', percent: 5, usageLimit: null, expiresAt: null, restrictedTo: [] }),
    ).toEqual({
      type: 'percentage',
      amount: 500,
      usage_limit: null,
      expires_at: null,
      restricted_to: null,
    });
    expect(dodo.parseNewDiscount({ code: 'a b', percent: 10 })).toEqual({ invalid: 'code' });
    expect(dodo.parseNewDiscount({ percent: 0 })).toEqual({ invalid: 'percent' });
    expect(dodo.parseNewDiscount({ percent: 101 })).toEqual({ invalid: 'percent' });
    expect(dodo.parseNewDiscount({ percent: 10.5 })).toEqual({ invalid: 'percent' });
    expect(dodo.parseNewDiscount({ percent: 10, usage_limit: 0 })).toEqual({ invalid: 'usage_limit' });
    expect(dodo.parseNewDiscount({ percent: 10, expires_at: '2020-01-01T00:00:00Z' })).toEqual({
      invalid: 'expires_at',
    });
    expect(dodo.parseNewDiscount({ percent: 10, restricted_to: ['bad id!'] })).toEqual({
      invalid: 'restricted_to',
    });
  });

  it('reads a code from a code link', () => {
    expect(codeFromSearch('?code=diwali20')).toBe('DIWALI20');
    expect(codeFromSearch('?code=%20x%20')).toBeNull();
    expect(codeFromSearch('?code=<script>')).toBeNull();
    expect(codeFromSearch('')).toBeNull();
  });

  it('admin: state, products and links of a code', () => {
    const d = {
      id: 'd',
      code: 'A20',
      kind: 'percentage' as const,
      percent: 20,
      timesUsed: 1,
      usageLimit: 2,
      expiresAt: null,
      restrictedTo: [] as string[],
      createdAt: '',
    };
    expect(discountState(d)).toBe('active');
    expect(discountState({ ...d, timesUsed: 2 })).toBe('used_up');
    expect(discountState({ ...d, expiresAt: '2020-01-01T00:00:00Z' })).toBe('expired');
    const products = [
      {
        id: '1',
        updated_at: '',
        slug: 'luts',
        is_free: false,
        provider_product_id: 'pdt_a',
        provider_product_id_inr: 'pdt_a_inr',
      },
      {
        id: '2',
        updated_at: '',
        slug: 'guide',
        is_free: false,
        provider_product_id: 'pdt_b',
        provider_product_id_inr: null,
      },
      {
        id: '3',
        updated_at: '',
        slug: 'free',
        is_free: true,
        provider_product_id: null,
        provider_product_id_inr: null,
      },
    ];
    expect(productsFor(d, products).map((p) => p.slug)).toEqual(['luts', 'guide']);
    expect(productsFor({ ...d, restrictedTo: ['pdt_a_inr'] }, products).map((p) => p.slug)).toEqual(['luts']);
    expect(codeLink('https://site', 'luts', 'A20')).toBe('https://site/shop/luts?code=A20');
    expect(Date.parse(endOfDay('2026-12-31'))).toBeGreaterThan(
      Date.parse('2026-12-31T00:00:00Z') - 86_400_000,
    );
  });
});
