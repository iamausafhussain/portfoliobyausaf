/**
 * Dodo Payments adapter (spec 08 §3.2): checkout sessions and keeping your products in step.
 * API: https://docs.dodopayments.com — POST /checkouts, POST /products, PATCH /products/{id},
 * GET /payments/{id}, and /discounts (list, create, delete, look up by code).
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

async function call<T>(env: DodoEnv, method: string, path: string, body?: unknown): Promise<T> {
  const f = env.fetch ?? fetch;
  const res = await f(`${dodoBase(env.mode)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    // GET and DELETE carry no body
    body: body === undefined ? undefined : JSON.stringify(body),
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

export interface CheckoutArgs {
  providerProductId: string;
  siteProductId: string;
  refHash: string;
  returnUrl: string;
  /** where Dodo's back button goes (the product page) */
  cancelUrl?: string;
  /** a discount code to apply for the buyer (from a code link) */
  discountCode?: string | null;
}

export function checkoutBody(args: CheckoutArgs) {
  return {
    product_cart: [{ product_id: args.providerProductId, quantity: 1 }],
    return_url: args.returnUrl,
    ...(args.cancelUrl ? { cancel_url: args.cancelUrl } : {}),
    ...(args.discountCode ? { discount_codes: [args.discountCode] } : {}),
    metadata: { product_id: args.siteProductId, ref_hash: args.refHash },
    feature_flags: { allow_discount_code: true },
  };
}

/** A hosted checkout for one product; returns where to send the buyer. */
export async function createCheckout(
  env: DodoEnv,
  args: CheckoutArgs,
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

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export interface ProviderPayment {
  status: string | null;
  metadata: Record<string, unknown>;
}

/** One payment, to tell the thank-you page that it failed (spec 08 CO-3a). */
export async function getPayment(env: DodoEnv, paymentId: string): Promise<ProviderPayment> {
  const p = await call<{ status?: string | null; metadata?: Record<string, unknown> }>(
    env,
    'GET',
    `/payments/${encodeURIComponent(paymentId)}`,
  );
  return { status: p.status ?? null, metadata: p.metadata ?? {} };
}

/** Statuses after which this checkout attempt can't succeed any more. */
export const FAILED_PAYMENT_STATUSES = ['failed', 'cancelled', 'requires_payment_method'] as const;
export const paymentFailed = (status: string | null | undefined) =>
  !!status && (FAILED_PAYMENT_STATUSES as readonly string[]).includes(status);

/* ------------------------------------------------------------------ */
/* Discount codes (spec 08 DC)                                         */
/* ------------------------------------------------------------------ */

/** What the admin sees of a code. */
export interface Discount {
  id: string;
  code: string;
  /** codes made here are percentages; flat ones can come from Dodo's dashboard */
  kind: 'percentage' | 'flat';
  /** whole percent, 1–100 (0 for flat codes) */
  percent: number;
  timesUsed: number;
  usageLimit: number | null;
  expiresAt: string | null;
  /** Dodo product ids; empty = every product */
  restrictedTo: string[];
  createdAt: string;
}

interface DodoDiscount {
  discount_id: string;
  code: string;
  type: string;
  amount: number;
  times_used?: number;
  usage_limit?: number | null;
  expires_at?: string | null;
  restricted_to?: string[] | null;
  created_at: string;
}

const toDiscount = (d: DodoDiscount): Discount => ({
  id: d.discount_id,
  code: d.code,
  kind: d.type === 'percentage' ? 'percentage' : 'flat',
  percent: d.type === 'percentage' ? Math.round(d.amount / 100) : 0,
  timesUsed: d.times_used ?? 0,
  usageLimit: d.usage_limit ?? null,
  expiresAt: d.expires_at ?? null,
  restrictedTo: d.restricted_to ?? [],
  createdAt: d.created_at,
});

/** Codes are letters, digits, "-" and "_", 3–32 characters; Dodo stores them upper-case. */
export const DISCOUNT_CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export interface NewDiscount {
  /** empty → Dodo makes a random one */
  code: string;
  percent: number;
  usageLimit: number | null;
  expiresAt: string | null;
  restrictedTo: string[];
}

/** Checks what the admin sent; returns the discount or the name of the bad field. */
export function parseNewDiscount(v: Record<string, unknown>): NewDiscount | { invalid: string } {
  const code = typeof v.code === 'string' ? v.code.trim() : '';
  if (code && !DISCOUNT_CODE_RE.test(code)) return { invalid: 'code' };
  const percent = v.percent;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 100)
    return { invalid: 'percent' };
  const usageLimit = v.usage_limit ?? null;
  if (
    usageLimit !== null &&
    (typeof usageLimit !== 'number' || !Number.isInteger(usageLimit) || usageLimit < 1)
  )
    return { invalid: 'usage_limit' };
  const expiresAt = v.expires_at ?? null;
  if (expiresAt !== null && (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))))
    return { invalid: 'expires_at' };
  if (typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now()) return { invalid: 'expires_at' };
  const restrictedTo = Array.isArray(v.restricted_to) ? v.restricted_to : [];
  if (
    restrictedTo.length > 100 ||
    !restrictedTo.every((x) => typeof x === 'string' && /^[\w-]{1,100}$/.test(x))
  )
    return { invalid: 'restricted_to' };
  return {
    code,
    percent,
    usageLimit: usageLimit as number | null,
    expiresAt: expiresAt as string | null,
    restrictedTo: restrictedTo as string[],
  };
}

export function discountBody(d: NewDiscount) {
  return {
    type: 'percentage',
    // basis points: 20% → 2000
    amount: Math.round(d.percent * 100),
    ...(d.code ? { code: d.code.toUpperCase() } : {}),
    usage_limit: d.usageLimit,
    expires_at: d.expiresAt,
    restricted_to: d.restrictedTo.length ? d.restrictedTo : null,
  };
}

export async function listDiscounts(env: DodoEnv): Promise<Discount[]> {
  const out: Discount[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await call<{ items: DodoDiscount[] }>(
      env,
      'GET',
      `/discounts?page_size=100&page_number=${page}`,
    );
    out.push(...r.items.map(toDiscount));
    if (r.items.length < 100) break;
  }
  return out;
}

export async function createDiscount(env: DodoEnv, d: NewDiscount): Promise<Discount> {
  return toDiscount(await call<DodoDiscount>(env, 'POST', '/discounts', discountBody(d)));
}

export async function deleteDiscount(env: DodoEnv, id: string): Promise<void> {
  try {
    await call(env, 'DELETE', `/discounts/${encodeURIComponent(id)}`);
  } catch (e) {
    // already gone
    if (!(e instanceof ProviderError && e.status === 404)) throw e;
  }
}

/** Whether a code can be used right now (not unknown, deleted, expired or used up). */
export async function discountUsable(env: DodoEnv, code: string): Promise<boolean> {
  try {
    await call(env, 'GET', `/discounts/code/${encodeURIComponent(code.toUpperCase())}`);
    return true;
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 404 || e.status === 422)) return false;
    throw e;
  }
}
