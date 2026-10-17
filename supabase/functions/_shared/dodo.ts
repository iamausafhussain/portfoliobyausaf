/**
 * Dodo Payments adapter (spec 08 §3.2): checkout sessions and keeping your products in step.
 * API: https://docs.dodopayments.com — POST /checkouts, POST /products, PATCH /products/{id}.
 * Webhook signatures and event reading are in shop.ts (Standard Webhooks).
 */

export interface DodoEnv {
  apiKey: string;
  mode: 'test' | 'live';
  fetch?: typeof fetch;
}

export const dodoBase = (mode: 'test' | 'live') =>
  mode === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

export class ProviderError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

async function call<T>(env: DodoEnv, method: string, path: string, body: unknown): Promise<T> {
  const f = env.fetch ?? fetch;
  const res = await f(`${dodoBase(env.mode)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new ProviderError(
      res.status,
      `Dodo ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`,
    );
  return (text ? JSON.parse(text) : {}) as T;
}

export interface ProviderProduct {
  siteProductId: string;
  name: string;
  description: string;
  /** smallest unit (cents / paise) */
  price: number;
  currency: 'USD' | 'INR';
}

/** The body for creating or updating a one-time digital product. */
export function productBody(p: ProviderProduct) {
  return {
    name: p.name.slice(0, 100),
    description: p.description.slice(0, 1000) || null,
    tax_category: 'digital_products',
    price: { type: 'one_time_price', price: p.price, currency: p.currency, purchasing_power_parity: false },
    metadata: { site_product_id: p.siteProductId, currency: p.currency },
  };
}

/** Creates the product on Dodo, or updates it when it already exists; returns its id. */
export async function upsertProduct(
  env: DodoEnv,
  existingId: string | null,
  p: ProviderProduct,
): Promise<string> {
  if (existingId) {
    try {
      await call(env, 'PATCH', `/products/${encodeURIComponent(existingId)}`, productBody(p));
      return existingId;
    } catch (e) {
      // e.g. a test-mode id after switching to live mode: create the product afresh
      if (!(e instanceof ProviderError && e.status === 404)) throw e;
    }
  }
  const created = await call<{ product_id: string }>(env, 'POST', '/products', productBody(p));
  if (!created.product_id) throw new ProviderError(502, 'Dodo did not return a product id');
  return created.product_id;
}

export function checkoutBody(args: {
  providerProductId: string;
  siteProductId: string;
  refHash: string;
  returnUrl: string;
}) {
  return {
    product_cart: [{ product_id: args.providerProductId, quantity: 1 }],
    return_url: args.returnUrl,
    metadata: { product_id: args.siteProductId, ref_hash: args.refHash },
    feature_flags: { allow_discount_code: true },
  };
}

/** A hosted checkout for one product; returns where to send the buyer. */
export async function createCheckout(
  env: DodoEnv,
  args: { providerProductId: string; siteProductId: string; refHash: string; returnUrl: string },
): Promise<{ url: string; sessionId: string }> {
  const r = await call<{ session_id: string; checkout_url: string | null }>(
    env,
    'POST',
    '/checkouts',
    checkoutBody(args),
  );
  if (!r.checkout_url) throw new ProviderError(502, 'Dodo did not return a checkout address');
  return { url: r.checkout_url, sessionId: r.session_id };
}
