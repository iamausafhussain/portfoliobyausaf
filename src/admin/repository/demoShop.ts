/**
 * The shop in demo mode (spec 08 CO-10): the same rules as the Edge Functions, using the
 * same shared helpers, with Dodo's checkout and webhook simulated in the browser. Emails
 * land in an outbox the tests can read. Development only (never in a production build).
 */
import {
  canRefresh,
  downloadBlock,
  downloadsLeft,
  downloadToken,
  expiryFrom,
  FREE_PER_DAY,
  FREE_PER_EMAIL_PER_DAY,
  maskEmail,
  randomRef,
  sha256Hex,
} from '../../../supabase/functions/_shared/shop.ts';
import { ShopError, type ShopPublicApi } from '../../data/shop';
import { RepoError } from './errors';
import type { OrderRow, ProductFileRow, Row, ShopAdminApi, ShopPageRow, StoredFile } from './types';

const SECRET = 'demo-shop-secret-demo-shop-secret-0123456789';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface DemoMail {
  to: string;
  subject: string;
  link: string;
  reason: 'purchase' | 'free' | 'fresh';
}

interface DemoOrder extends OrderRow {
  token_version: number;
  ref_hash: string | null;
}

export interface DemoShopContext {
  products(): Row[];
  updateProduct(id: string, patch: Row | Record<string, unknown>): Row;
  files: Map<string, StoredFile & { url: string }>;
  requireOwner(): Promise<void>;
  delay(ms?: number): Promise<unknown>;
  now(): string;
}

export function createDemoShop(
  ctx: DemoShopContext,
  seed: {
    files: { productId: string; file_path: string | null; external_url: string | null; file_name: string }[];
    orders: Omit<OrderRow, 'expires_at'>[];
  },
) {
  const productFiles = new Map<string, ProductFileRow>(
    seed.files.map((f) => [f.productId, { product_id: f.productId, ...f }]),
  );
  let orders: DemoOrder[] = seed.orders.map((o) => ({
    ...o,
    expires_at: expiryFrom(Date.parse(o.created_at)),
    token_version: 1,
    ref_hash: null,
  }));
  const outbox: DemoMail[] = [];
  const pending = new Map<string, { productId: string; currency: 'USD' | 'INR' }>();
  let webhookDelay = 1200;
  let pages: ShopPageRow[] = (['terms', 'refunds', 'privacy'] as const).map((slug) => ({
    slug,
    title: { terms: 'Terms of sale', refunds: 'Refund policy', privacy: 'Privacy' }[slug],
    body: `> **Review before publishing.** Demo ${slug} text.\n\nDemo — your ${slug} policy goes here.`,
    is_published: slug !== 'privacy',
    updated_at: '2026-10-01T09:00:00Z',
  }));

  const product = (id: string | null) => ctx.products().find((p) => p.id === id) ?? null;
  const tokenOf = (o: DemoOrder) => downloadToken(SECRET, o.id, o.token_version);
  const link = (token: string) => `/d/${token}`;
  async function byToken(token: string): Promise<DemoOrder> {
    for (const o of orders) if ((await tokenOf(o)) === token) return o;
    throw new ShopError('not_found');
  }
  const patch = (id: string, values: Partial<DemoOrder>) => {
    orders = orders.map((o) => (o.id === id ? { ...o, ...values } : o));
    return orders.find((o) => o.id === id)!;
  };
  async function mail(o: DemoOrder, reason: DemoMail['reason']) {
    outbox.push({
      to: o.email,
      subject: `Your download: ${o.product_title}`,
      link: link(await tokenOf(o)),
      reason,
    });
  }
  function newOrder(values: Partial<DemoOrder> & Pick<DemoOrder, 'email' | 'status'>): DemoOrder {
    const p = product(values.product_id ?? null);
    const o: DemoOrder = {
      id: crypto.randomUUID(),
      product_id: p?.id ?? null,
      product_title: String(p?.title ?? 'Your purchase'),
      buyer_name: '',
      amount: 0,
      currency: 'USD',
      provider: 'demo',
      provider_payment_id: null,
      downloads_used: 0,
      download_limit: 5,
      refresh_count: 0,
      created_at: new Date().toISOString(),
      expires_at: expiryFrom(),
      token_version: 1,
      ref_hash: null,
      ...values,
    };
    orders = [o, ...orders];
    return o;
  }

  /* ---------------- public (what the Edge Functions do) ---------------- */
  const publicApi: ShopPublicApi & {
    /** The simulated provider checkout page calls this when "Pay" is pressed. */
    demoPay(ref: string, email: string, name: string): Promise<void>;
    demoCheckout(ref: string): { productId: string; currency: 'USD' | 'INR' } | null;
  } = {
    async checkout(productId, currency) {
      await ctx.delay(150);
      const p = product(productId);
      if (!p || !p.is_published || p.is_free) throw new ShopError('not_for_sale');
      const providerId = currency === 'INR' ? p.provider_product_id_inr : p.provider_product_id;
      if (!providerId || (currency === 'INR' ? p.price_inr == null : p.price_usd == null))
        throw new ShopError('not_ready');
      const ref = randomRef();
      pending.set(ref, { productId, currency });
      return { url: `/shop/demo-checkout?ref=${ref}` };
    },
    demoCheckout: (ref) => pending.get(ref) ?? null,
    async demoPay(ref, email, name) {
      const c = pending.get(ref);
      if (!c) throw new ShopError('not_found');
      pending.delete(ref);
      const p = product(c.productId)!;
      const refHash = await sha256Hex(ref);
      // the provider's webhook arrives a moment after the buyer is sent back
      const record = async () => {
        const o = newOrder({
          product_id: p.id,
          email: email.trim().toLowerCase(),
          buyer_name: name.trim(),
          amount: Number(c.currency === 'INR' ? p.price_inr : p.price_usd),
          currency: c.currency,
          status: 'paid',
          provider_payment_id: `pay_demo_${Math.random().toString(36).slice(2, 10)}`,
          ref_hash: refHash,
        });
        await mail(o, 'purchase');
      };
      if (webhookDelay > 0) setTimeout(() => void record(), webhookDelay);
      else await record();
    },
    async orderStatus(ref) {
      await ctx.delay(80);
      const h = await sha256Hex(ref);
      const o = orders.find((x) => x.ref_hash === h);
      if (!o) return { ready: false };
      if (o.status !== 'paid') return { ready: false, expired: true };
      const p = product(o.product_id);
      return {
        ready: true,
        token: await tokenOf(o),
        product: {
          title: o.product_title,
          slug: (p?.slug as string) ?? null,
          cover: (p?.cover as never) ?? null,
        },
      };
    },
    async downloadInfo(token) {
      await ctx.delay(80);
      const o = await byToken(token);
      const p = product(o.product_id);
      return {
        product: {
          title: o.product_title,
          slug: (p?.slug as string) ?? null,
          cover: (p?.cover as never) ?? null,
          format: String(p?.file_format ?? ''),
          size: (p?.file_size as number | null) ?? null,
          version: String(p?.version ?? ''),
        },
        status: o.status,
        block: downloadBlock(o),
        left: downloadsLeft(o),
        expires_at: o.expires_at,
        can_refresh: canRefresh(o),
        email: maskEmail(o.email),
      };
    },
    async download(token) {
      await ctx.delay(120);
      const o = await byToken(token);
      const block = downloadBlock(o);
      if (block) throw new ShopError(block, canRefresh(o));
      const f = o.product_id ? productFiles.get(o.product_id) : undefined;
      if (!f || (!f.file_path && !f.external_url)) throw new ShopError('file_missing');
      const updated = patch(o.id, { downloads_used: o.downloads_used + 1 });
      const url = f.external_url ?? ctx.files.get(f.file_path!)?.url ?? '';
      return { url, left: downloadsLeft(updated) };
    },
    async refresh(token) {
      await ctx.delay(120);
      const o = await byToken(token);
      if (!canRefresh(o)) throw new ShopError('cannot_refresh');
      const updated = patch(o.id, {
        token_version: o.token_version + 1,
        downloads_used: 0,
        expires_at: expiryFrom(),
        refresh_count: o.refresh_count + 1,
      });
      await mail(updated, 'fresh');
      return { sent: true, email: maskEmail(o.email) };
    },
    async claimFree(productId, email, name) {
      await ctx.delay(150);
      const e = email.trim().toLowerCase();
      if (!EMAIL_RE.test(e)) throw new ShopError('server');
      const p = product(productId);
      if (!p || !p.is_published || !p.is_free) throw new ShopError('not_for_sale');
      const since = Date.now() - 86_400_000;
      const recent = orders.filter((o) => o.status === 'free' && Date.parse(o.created_at) > since);
      if (
        recent.filter((o) => o.email === e).length >= FREE_PER_EMAIL_PER_DAY ||
        recent.length >= FREE_PER_DAY
      )
        throw new ShopError('rate_limited');
      const o = newOrder({
        product_id: p.id,
        email: e,
        buyer_name: (name ?? '').trim(),
        status: 'free',
        provider: 'free',
      });
      await mail(o, 'free');
      return { sent: true };
    },
    async page(slug) {
      await ctx.delay(40);
      return structuredClone(pages.find((p) => p.slug === slug && p.is_published) ?? null);
    },
  };

  /* ---------------- admin ---------------- */
  const adminApi: ShopAdminApi = {
    async status() {
      await ctx.requireOwner();
      return {
        provider: 'demo',
        mode: 'test',
        configured: { provider: true, webhook: true, tokens: true, email: true, site: true },
      };
    },
    async getFile(productId) {
      await ctx.requireOwner();
      return structuredClone(productFiles.get(productId) ?? null);
    },
    async setFile(productId, file) {
      await ctx.delay();
      await ctx.requireOwner();
      if (file.file_path && file.external_url)
        throw new RepoError('invalid', 'Either a stored file or a link, not both.');
      if (file.external_url && !/^https:\/\//.test(file.external_url))
        throw new RepoError('invalid', 'The link must start with https://', 'external_url');
      if (!file.file_path && !file.external_url) productFiles.delete(productId);
      else productFiles.set(productId, { product_id: productId, ...file });
    },
    async sync(productId) {
      await ctx.delay(200);
      await ctx.requireOwner();
      const p = product(productId);
      if (!p) throw new RepoError('not_found', 'This product no longer exists.');
      if (p.is_free) return structuredClone(p);
      const short = productId.slice(-6);
      return structuredClone(
        ctx.updateProduct(productId, {
          provider_product_id:
            p.price_usd != null ? (p.provider_product_id ?? `pdt_demo_${short}`) : p.provider_product_id,
          provider_product_id_inr:
            p.price_inr != null
              ? (p.provider_product_id_inr ?? `pdt_demo_${short}_inr`)
              : p.provider_product_id_inr,
        }),
      );
    },
    async orders({ status, productId, search, limit }) {
      await ctx.delay(40);
      await ctx.requireOwner();
      const q = (search ?? '').trim().toLowerCase();
      const hits = orders
        .filter((o) => (!status || o.status === status) && (!productId || o.product_id === productId))
        .filter((o) => !q || o.email.includes(q) || o.buyer_name.toLowerCase().includes(q))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const rows = hits.slice(0, limit).map(({ token_version, ref_hash, ...row }) => row);
      return { rows: structuredClone(rows), total: hits.length };
    },
    async updateOrder(id, values) {
      await ctx.delay();
      await ctx.requireOwner();
      if (!orders.some((o) => o.id === id)) throw new RepoError('not_found', 'This order no longer exists.');
      patch(id, values);
    },
    async resend(orderId) {
      await ctx.delay();
      await ctx.requireOwner();
      const o = orders.find((x) => x.id === orderId);
      if (!o) throw new RepoError('not_found', 'This order no longer exists.');
      if (o.status === 'refunded' || o.status === 'revoked')
        throw new RepoError('invalid', `This order is ${o.status}; its link can't be re-sent.`);
      const updated = patch(o.id, {
        token_version: o.token_version + 1,
        expires_at: Date.parse(o.expires_at) < Date.now() ? expiryFrom() : o.expires_at,
      });
      await mail(updated, 'fresh');
      return { sent: true };
    },
    async sales(days) {
      await ctx.requireOwner();
      const since = Date.now() - days * 86_400_000;
      const paid = orders.filter((o) => o.status === 'paid' && Date.parse(o.created_at) >= since);
      const revenue: Record<string, number> = {};
      for (const o of paid) revenue[o.currency] = (revenue[o.currency] ?? 0) + o.amount;
      return { orders: paid.length, revenue };
    },
    async pages() {
      await ctx.delay(40);
      await ctx.requireOwner();
      return structuredClone(pages);
    },
    async updatePage(slug, values, expectedUpdatedAt) {
      await ctx.delay();
      await ctx.requireOwner();
      const current = pages.find((p) => p.slug === slug)!;
      if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt)
        throw new RepoError(
          'conflict',
          'This was changed somewhere else — reload to see the latest version.',
        );
      if (values.title !== undefined && !values.title.trim())
        throw new RepoError('invalid', 'Add a title.', 'title');
      if (values.body !== undefined && values.body.length > 20000)
        throw new RepoError('invalid', 'Keep it under 20,000 characters.', 'body');
      const next = { ...current, ...values, updated_at: ctx.now() };
      pages = pages.map((p) => (p.slug === slug ? next : p));
      return structuredClone(next);
    },
  };

  return {
    publicApi,
    adminApi,
    /** Test hooks */
    outbox,
    setWebhookDelay(ms: number) {
      webhookDelay = ms;
    },
    removeProduct(productId: string) {
      const f = productFiles.get(productId);
      if (f?.file_path) ctx.files.delete(f.file_path);
      productFiles.delete(productId);
    },
    /** A download token for an order (tests only). */
    /** The newest order's id (tests only). */
    latestOrderId: () => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null,
    tokenFor: async (orderId: string) => tokenOf(orders.find((o) => o.id === orderId)!),
    /** Simulates the provider's refund webhook (tests only). */
    refund(orderId: string) {
      patch(orderId, { status: 'refunded' });
    },
  };
}
