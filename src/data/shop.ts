/**
 * The public site's side of the shop (spec 08 §3.1): types for what the shop Edge
 * Functions return, errors, and the pure helpers both the site and the functions use.
 */
import type { ImageRef } from './schemas';
export {
  DOWNLOAD_DAYS,
  DOWNLOAD_LIMIT,
  formatPrice,
  type Currency,
  type DownloadBlock,
} from '../../supabase/functions/_shared/shop.ts';
import type { Currency, DownloadBlock } from '../../supabase/functions/_shared/shop.ts';

export type ShopErrorCode =
  | 'not_for_sale'
  | 'not_ready'
  | 'not_found'
  | 'rate_limited'
  | 'refunded'
  | 'revoked'
  | 'expired'
  | 'used_up'
  | 'cannot_refresh'
  | 'file_missing'
  | 'busy'
  | 'provider_unavailable'
  | 'code_invalid'
  | 'offline'
  | 'server';

export class ShopError extends Error {
  readonly code: ShopErrorCode;
  readonly canRefresh: boolean;
  constructor(code: ShopErrorCode, canRefresh = false) {
    super(code);
    this.name = 'ShopError';
    this.code = code;
    this.canRefresh = canRefresh;
  }
}

const known: ShopErrorCode[] = [
  'not_for_sale',
  'not_ready',
  'not_found',
  'rate_limited',
  'refunded',
  'revoked',
  'expired',
  'used_up',
  'cannot_refresh',
  'file_missing',
  'busy',
  'provider_unavailable',
  'code_invalid',
];

/** A function's error body (or a network failure) as a ShopError. */
export function shopErrorFrom(status: number, body: unknown): ShopError {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; can_refresh?: unknown };
  const code =
    typeof b.error === 'string' && (known as string[]).includes(b.error) ? (b.error as ShopErrorCode) : null;
  if (code) return new ShopError(code, b.can_refresh === true);
  if (status === 0) return new ShopError('offline');
  if (status === 429) return new ShopError('rate_limited');
  if (status === 404) return new ShopError('not_found');
  return new ShopError('server');
}

/** What visitors read about each problem. */
export const shopErrorText: Record<ShopErrorCode, string> = {
  not_for_sale: 'This product isn’t available right now.',
  not_ready: 'This product isn’t ready for sale yet. Please try again later.',
  not_found: 'This download link isn’t valid. Check the link in your email.',
  rate_limited: 'Too many requests just now. Please try again in a little while.',
  refunded: 'This order was refunded, so the download is no longer available.',
  revoked: 'This download link has been cancelled. Get in touch if you think that’s a mistake.',
  expired: 'This download link has expired.',
  used_up: 'This download link has been used the maximum number of times.',
  cannot_refresh: 'A fresh link can’t be sent for this order. Please get in touch.',
  file_missing: 'The file isn’t available right now. Please get in touch and I’ll sort it out.',
  busy: 'Another download just started. Please try again in a moment.',
  provider_unavailable: 'The payment page couldn’t be opened. Please try again in a minute.',
  code_invalid: 'This discount code isn’t valid any more, or doesn’t apply to this product.',
  offline: 'Couldn’t reach the server. Check your connection and try again.',
  server: 'Something went wrong on my side. Please try again.',
};

export interface OrderStatusReply {
  ready: boolean;
  expired?: boolean;
  /** the payment didn't go through (spec 08 CO-3a) */
  failed?: boolean;
  token?: string;
  product?: { title: string; slug: string | null; cover: ImageRef | null } | null;
}

export interface DownloadInfo {
  product: {
    title: string;
    slug: string | null;
    cover: ImageRef | null;
    format: string;
    size: number | null;
    version: string;
  };
  status: 'paid' | 'free' | 'refunded' | 'revoked';
  block: DownloadBlock;
  left: number;
  expires_at: string;
  can_refresh: boolean;
  /** masked, e.g. "b•••@example.com" */
  email: string;
}

/** The shop's server side, as the site sees it (Supabase Edge Functions, or the demo). */
export interface ShopPublicApi {
  /** Starts a purchase: where to send the buyer (the provider's checkout). */
  /** `code`: a discount code from a code link (spec 08 DC-4). */
  checkout(productId: string, currency: Currency, code?: string | null): Promise<{ url: string }>;
  /** Thank-you page: has the payment been confirmed yet, or did it fail? */
  orderStatus(ref: string, paymentId?: string | null): Promise<OrderStatusReply>;
  downloadInfo(token: string): Promise<DownloadInfo>;
  /** Counts a download and returns a short-lived link to the file. */
  download(token: string): Promise<{ url: string; left: number }>;
  /** Once a link has run out: a fresh one to the buyer's email. */
  refresh(token: string): Promise<{ sent: boolean; email: string }>;
  /** Free products: the link goes to this email. */
  claimFree(productId: string, email: string, name?: string): Promise<{ sent: boolean }>;
  /** A published policy page, or null. */
  page(slug: 'terms' | 'refunds' | 'privacy'): Promise<unknown>;
}

/** "18.4 MB" */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Buyers on Indian time see INR first when a product has an INR price (spec 08 v0.2). */
export function preferredCurrency(hasInr: boolean, timeZone?: string): Currency {
  if (!hasInr) return 'USD';
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' ? 'INR' : 'USD';
}

export const productKindLabels = { pdf: 'PDF', tool: 'Tool', bundle: 'Bundle' } as const;

/** A discount code from a code link (`?code=…`), or null when it isn't a plausible code. */
export function codeFromSearch(search: string): string | null {
  const c = new URLSearchParams(search).get('code')?.trim() ?? '';
  return /^[A-Za-z0-9_-]{3,32}$/.test(c) ? c.toUpperCase() : null;
}
