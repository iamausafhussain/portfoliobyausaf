-- Part 8 · 0010 — Box Office: products, orders and their files (spec 08 §3.3)
--
--   products        public reads published rows; owner manages them
--   product_files   where each product's file is (private storage path or external link);
--                   owner only — visitors never see it
--   orders          created only by the shop Edge Functions (service role); owner reads them
--                   and may revoke / reset downloads. Download links are tokens derived
--                   from a server secret; only their hash is stored here.
--   shop_events     payment-provider events already processed (each handled once)
--   shop_pages      Terms / Refund policy / Privacy (public when published)
--   bucket products private, 50 MB per file; only the owner and the Edge Functions use it
--
-- Safe to run more than once. Run it in the Supabase SQL Editor after 0009.
-- If you ever re-run 0005_rls.sql, re-run this file afterwards (0005 resets table grants).

do $$ begin
  create type public.product_kind as enum ('pdf', 'tool', 'bundle');
exception when duplicate_object then null; end $$;

-- custom sections can be placed after the Box Office chapter
alter type public.chapter_key add value if not exists 'shop' before 'contact';

do $$ begin
  create type public.order_status as enum ('paid', 'free', 'refunded', 'revoked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (public.is_slug(slug)),
  title                   text not null check (char_length(btrim(title)) between 1 and 100),
  kind                    public.product_kind not null default 'pdf',
  tagline                 text not null default '' check (char_length(tagline) <= 160),
  description             text not null default '' check (char_length(description) <= 20000),
  included                text[] not null default '{}' check (public.is_text_list(included, 20, 120)),
  requirements            text not null default '' check (char_length(requirements) <= 200),
  version                 text not null default '' check (char_length(version) <= 30),
  file_format             text not null default '' check (char_length(file_format) <= 40),
  file_size               bigint check (file_size is null or file_size >= 0),
  is_free                 boolean not null default false,
  -- prices in the smallest unit: cents and paise
  price_usd               int check (price_usd is null or price_usd between 50 and 1000000),
  price_inr               int check (price_inr is null or price_inr between 1000 and 100000000),
  cover                   jsonb check (public.is_image_ref(cover)),
  gallery                 jsonb not null default '[]' check (public.is_image_ref_array(gallery, 8)),
  is_featured             boolean not null default false,
  provider_product_id     text check (provider_product_id is null or char_length(provider_product_id) <= 100),
  provider_product_id_inr text check (provider_product_id_inr is null or char_length(provider_product_id_inr) <= 100),
  sort_order              int not null default 0,
  is_published            boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- a product is either free or has a USD price
  constraint products_price_set check (is_free or price_usd is not null)
);

create index if not exists products_published_order on public.products (is_published, sort_order);

-- ---------------------------------------------------------------------------
-- product_files (one per product)
-- ---------------------------------------------------------------------------
create table if not exists public.product_files (
  product_id   uuid primary key references public.products (id) on delete cascade,
  file_path    text check (file_path is null or (file_path like 'products/%' and char_length(file_path) <= 300)),
  external_url text check (external_url is null or public.is_https_url(external_url)),
  file_name    text not null default '' check (char_length(file_name) <= 200),
  updated_at   timestamptz not null default now(),
  constraint product_files_one_source check (not (file_path is not null and external_url is not null))
);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid references public.products (id) on delete set null,
  product_title       text not null check (char_length(product_title) <= 100),
  email               text not null check (public.is_email(email)),
  buyer_name          text not null default '' check (char_length(buyer_name) <= 120),
  amount              int not null default 0 check (amount >= 0),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status              public.order_status not null,
  provider            text not null default '' check (char_length(provider) <= 30),
  provider_payment_id text unique check (provider_payment_id is null or char_length(provider_payment_id) <= 100),
  provider_session_id text check (provider_session_id is null or char_length(provider_session_id) <= 100),
  -- the download link: a token derived from a server secret, the order and a version;
  -- only its hash is kept, and bumping the version cancels the old link
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_version       int not null default 1 check (token_version >= 1),
  -- hash of the buyer's thank-you-page reference (spec 08 CO-3)
  ref_hash            text unique check (ref_hash is null or ref_hash ~ '^[0-9a-f]{64}$'),
  downloads_used      int not null default 0 check (downloads_used >= 0),
  download_limit      int not null default 5 check (download_limit between 1 and 100),
  expires_at          timestamptz not null default (now() + interval '30 days'),
  refresh_count       int not null default 0 check (refresh_count >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists orders_created on public.orders (created_at desc);
create index if not exists orders_email on public.orders (lower(email), created_at desc);
create index if not exists orders_product on public.orders (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- shop_events (processed provider webhooks)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_events (
  event_id    text primary key check (char_length(event_id) <= 200),
  type        text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- shop_pages (policies)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_pages (
  slug         text primary key check (slug in ('terms', 'refunds', 'privacy')),
  title        text not null check (char_length(btrim(title)) between 1 and 100),
  body         text not null default '' check (char_length(body) <= 20000),
  is_published boolean not null default false,
  updated_at   timestamptz not null default now()
);

insert into public.shop_pages (slug, title, body) values
  ('terms', 'Terms of sale', $md$> **Review before publishing.** This is a starting template, not legal advice. Edit it to match how you sell.

Products sold here are digital downloads for your personal or commercial creative work, as described on each product page. Buying a product gives you a licence to use it; it doesn't transfer ownership or the right to resell or share the files themselves.

Payments are processed by our payment provider, who acts as the seller of record and issues your receipt and any tax invoice.

Questions? Use the contact form on the home page.$md$),
  ('refunds', 'Refund policy', $md$> **Review before publishing.** This is a starting template, not legal advice. Edit it to match your policy.

Because these are digital downloads, sales are generally final once a file has been downloaded. If a file doesn't work as described, or you were charged twice, get in touch within 14 days of purchase and we'll fix it or refund you.

Refunds are made through our payment provider to your original payment method; once refunded, the download link stops working.$md$),
  ('privacy', 'Privacy', $md$> **Review before publishing.** This is a starting template, not legal advice. Edit it to match what you collect.

When you buy or download a product we keep your email address, what you bought and when, so we can send your download link and help with support. Payments are handled by our payment provider; we never see your card details.

We don't sell your information or use it for advertising. Ask through the contact form and we'll delete your details, except where we must keep records of a sale.$md$)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_files', 'orders', 'shop_pages'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (both layers fail closed, as in 0005)
-- ---------------------------------------------------------------------------
revoke all on public.products, public.product_files, public.orders, public.shop_events, public.shop_pages
  from anon, authenticated;

grant select on public.products, public.shop_pages to anon, authenticated;
grant insert, update, delete on public.products, public.product_files to authenticated;
grant select on public.product_files to authenticated;
grant update (title, body, is_published) on public.shop_pages to authenticated;
-- orders: the owner reads them and may revoke, reset downloads or extend the link;
-- only the Edge Functions (service role) create them
grant select on public.orders to authenticated;
grant update (status, downloads_used, expires_at, refresh_count) on public.orders to authenticated;
-- shop_events: no API access at all

alter table public.products      enable row level security;
alter table public.product_files enable row level security;
alter table public.orders        enable row level security;
alter table public.shop_events   enable row level security;
alter table public.shop_pages    enable row level security;

drop policy if exists "public read published" on public.products;
create policy "public read published" on public.products
  for select to anon, authenticated using (is_published);

drop policy if exists "owner full access" on public.products;
create policy "owner full access" on public.products
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "owner full access" on public.product_files;
create policy "owner full access" on public.product_files
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "owner read" on public.orders;
create policy "owner read" on public.orders
  for select to authenticated using ((select public.is_owner()));

drop policy if exists "owner update" on public.orders;
create policy "owner update" on public.orders
  for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "public read published" on public.shop_pages;
create policy "public read published" on public.shop_pages
  for select to anon, authenticated using (is_published);

drop policy if exists "owner read" on public.shop_pages;
create policy "owner read" on public.shop_pages
  for select to authenticated using ((select public.is_owner()));

drop policy if exists "owner update" on public.shop_pages;
create policy "owner update" on public.shop_pages
  for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for product files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', false, 52428800, null)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- only the owner may upload, read, replace or delete; buyers get 60-second signed links
-- made by the download function (service role)
drop policy if exists "product files: owner all" on storage.objects;
create policy "product files: owner all" on storage.objects
  for all to authenticated
  using (bucket_id = 'products' and (select public.is_owner()))
  with check (bucket_id = 'products' and (select public.is_owner()));

-- ---------------------------------------------------------------------------
-- reorder(): products can be dragged into order in the admin too (same function as 0007,
-- with 'products' added to its fixed list of tables)
-- ---------------------------------------------------------------------------
create or replace function public.reorder(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker -- runs with the caller's rights, so RLS still applies
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- fixed whitelist: the table name is never taken from user input beyond these values
  if p_table not in (
    'hero_media', 'projects', 'achievements', 'experience',
    'skills', 'testimonials', 'custom_sections', 'custom_items', 'products'
  ) then
    raise exception 'Cannot reorder table "%"', p_table using errcode = '22023';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'Duplicate ids in reorder list' using errcode = '22023';
  end if;

  execute format(
    'update public.%I as t set sort_order = (x.ord - 1)::int
       from unnest($1) with ordinality as x(id, ord)
      where t.id = x.id',
    p_table
  ) using p_ids;
end;
$$;

revoke execute on function public.reorder(text, uuid[]) from public, anon;
grant execute on function public.reorder(text, uuid[]) to authenticated;
