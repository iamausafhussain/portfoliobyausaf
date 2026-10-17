/** Shop: products, their files, orders and policy pages (spec 08 §3.3). */
import { z } from 'zod';
import {
  contentBase,
  email,
  Enums,
  httpsUrl,
  imageRef,
  requiredText,
  serverManaged,
  slug,
  storagePath,
  text,
  textList,
  timestamp,
  uuid,
} from './common';

/** Prices are whole cents / paise. */
export const priceUsd = z.number().int().min(50, 'At least $0.50').max(1_000_000, 'At most $10,000');
export const priceInr = z.number().int().min(1000, 'At least ₹10').max(100_000_000, 'At most ₹10,00,000');

const productFields = z.object({
  ...contentBase,
  slug,
  title: requiredText(100),
  kind: z.enum(Enums.product_kind),
  tagline: text(160),
  description: text(20000),
  included: textList(20, 120),
  requirements: text(200),
  version: text(30),
  file_format: text(40),
  file_size: z.number().int().min(0).nullable(),
  is_free: z.boolean(),
  price_usd: priceUsd.nullable(),
  price_inr: priceInr.nullable(),
  cover: imageRef.nullable(),
  gallery: z.array(imageRef).max(8, 'At most 8 images'),
  is_featured: z.boolean(),
  provider_product_id: z.string().max(100).nullable(),
  provider_product_id_inr: z.string().max(100).nullable(),
});
const priced = (v: { is_free?: boolean; price_usd?: number | null }) =>
  v.is_free === true || (v.price_usd !== null && v.price_usd !== undefined);
const pricedMessage = { message: 'Set a price, or mark the product as free', path: ['price_usd'] };

export const productRow = productFields.refine(priced, pricedMessage);
export type Product = z.infer<typeof productRow>;

/** What the admin form sends; the provider ids are filled in by the server. */
export const productInsert = productFields
  .omit({ ...serverManaged, provider_product_id: true, provider_product_id_inr: true })
  .partial({
    sort_order: true,
    is_published: true,
    kind: true,
    tagline: true,
    description: true,
    included: true,
    requirements: true,
    version: true,
    file_format: true,
    file_size: true,
    is_free: true,
    price_usd: true,
    price_inr: true,
    cover: true,
    gallery: true,
    is_featured: true,
  })
  .refine(priced, pricedMessage);

/** The file behind a product (owner only): stored in the private bucket, or an external link. */
export const productFile = z
  .object({
    product_id: uuid,
    file_path: storagePath
      .refine((p) => p.startsWith('products/'), 'Must be in the products bucket')
      .nullable(),
    external_url: httpsUrl.nullable(),
    file_name: text(200),
  })
  .refine((f) => !(f.file_path && f.external_url), 'Either a stored file or a link, not both');
export type ProductFile = z.infer<typeof productFile>;

export const orderRow = z.object({
  id: uuid,
  product_id: uuid.nullable(),
  product_title: requiredText(100),
  email,
  buyer_name: text(120),
  amount: z.number().int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(Enums.order_status),
  provider: text(30),
  provider_payment_id: z.string().nullable(),
  provider_session_id: z.string().nullable(),
  downloads_used: z.number().int().min(0),
  download_limit: z.number().int().min(0),
  expires_at: timestamp,
  refresh_count: z.number().int().min(0),
  created_at: timestamp,
  updated_at: timestamp,
});
export type Order = z.infer<typeof orderRow>;

export const shopPageSlugs = ['terms', 'refunds', 'privacy'] as const;
export type ShopPageSlug = (typeof shopPageSlugs)[number];
export const shopPageRow = z.object({
  slug: z.enum(shopPageSlugs),
  title: requiredText(100),
  body: text(20000),
  is_published: z.boolean(),
  updated_at: timestamp,
});
export type ShopPage = z.infer<typeof shopPageRow>;
