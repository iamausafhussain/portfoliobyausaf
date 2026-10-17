-- Part 8 shop security (spec 08 SH-1, AC-8.8). Included from rls.test.sql, inside its
-- transaction, so it uses the same helpers and is rolled back with it.

reset role;
select set_config('request.headers', '', true);

insert into public.products (id, slug, title, kind, price_usd, is_published, is_featured) values
  ('a8000000-0000-4000-8000-000000000001', 'lut-pack', 'LUT pack', 'tool', 1900, true, true),
  ('a8000000-0000-4000-8000-000000000002', 'draft-guide', 'Draft guide', 'pdf', 900, false, false);
insert into public.products (id, slug, title, kind, is_free, is_published) values
  ('a8000000-0000-4000-8000-000000000003', 'free-lut', 'Free LUT', 'tool', true, true);
insert into public.product_files (product_id, file_path, file_name) values
  ('a8000000-0000-4000-8000-000000000001', 'products/lut-pack.zip', 'lut-pack.zip');
insert into public.orders (id, product_id, product_title, email, amount, currency, status, provider_payment_id, token_hash) values
  ('a8100000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'LUT pack', 'buyer@example.com', 1900, 'USD', 'paid', 'pay_test_1', repeat('a', 64));
insert into public.shop_events (event_id, type) values ('evt_1', 'payment.succeeded');
insert into storage.objects (bucket_id, name) values ('products', 'lut-pack.zip');

-- ---------------------------------------------------------------------------
-- structure and constraints
-- ---------------------------------------------------------------------------
select tests.ok((select not public from storage.buckets where id = 'products'), 'AC-8.8  the products bucket is private');
select tests.eq((select file_size_limit from storage.buckets where id = 'products'), 52428800::bigint, 'CO-8    product files up to 50 MB');
select tests.throws($$insert into public.products (slug, title) values ('no-price', 'No price')$$,
  'SH-2    a paid product needs a price', '23514');
select tests.throws($$insert into public.products (slug, title, price_usd) values ('cheap', 'Cheap', 10)$$,
  'SH-2    prices start at $0.50', '23514');
select tests.throws($$insert into public.product_files (product_id, file_path, external_url) values ('a8000000-0000-4000-8000-000000000003', 'products/a.zip', 'https://example.com/a.zip')$$,
  'CO-8    a product file is either stored or linked, not both', '23514');
select tests.throws($$insert into public.product_files (product_id, external_url) values ('a8000000-0000-4000-8000-000000000003', 'http://insecure.example/a.zip')$$,
  'CO-8    external links must be https', '23514');
select tests.throws($$insert into public.orders (product_title, email, status, token_hash) values ('X', 'x@example.com', 'paid', 'not-a-hash')$$,
  'SH-4    only token hashes are stored (SHA-256 hex)', '23514');
select tests.throws($$insert into public.orders (product_title, email, status, provider_payment_id, token_hash) values ('X', 'x@example.com', 'paid', 'pay_test_1', repeat('b', 64))$$,
  'SH-3    one order per provider payment', '23505');
select tests.throws($$insert into public.orders (product_title, email, status, token_hash) values ('X', 'x@example.com', 'free', repeat('a', 64))$$,
  'SH-4    every download token is unique', '23505');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name ilike '%token' ),
  'SH-4    raw download tokens are never stored');
select tests.ok(exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'chapter_key' and e.enumlabel = 'shop'),
  'BX-1    custom sections can be placed after the Box Office');
select tests.throws($$insert into public.shop_events (event_id, type) values ('evt_1', 'payment.succeeded')$$,
  'SH-3    each provider event is stored once', '23505');
select tests.eq((select count(*) from public.shop_pages), 3::bigint, 'AD-8.6  terms, refunds and privacy pages exist');
select tests.ok((select bool_and(not is_published) from public.shop_pages), 'AD-8.6  policy pages start unpublished (review first)');

-- ---------------------------------------------------------------------------
-- anonymous visitor
-- ---------------------------------------------------------------------------
select tests.login_anon();
select tests.eq(tests.count($$select 1 from public.products$$), 2::bigint, 'AC-8.8  visitors see published products only');
select tests.eq(tests.count($$select 1 from public.products where slug = 'draft-guide'$$), 0::bigint, 'AC-8.8  drafts are hidden');
select tests.throws($$select * from public.product_files$$, 'AC-8.8  visitors cannot see file locations', '42501');
select tests.throws($$select * from public.orders$$, 'AC-8.8  visitors cannot read orders', '42501');
select tests.throws($$insert into public.orders (product_title, email, status, token_hash) values ('LUT pack', 'me@example.com', 'paid', repeat('c', 64))$$,
  'SH-1    visitors cannot create orders', '42501');
select tests.throws($$update public.orders set status = 'paid'$$, 'SH-1    visitors cannot change orders', '42501');
select tests.throws($$select * from public.shop_events$$, 'SH-3    visitors cannot read provider events', '42501');
select tests.throws($$insert into public.products (slug, title, price_usd) values ('mine', 'Mine', 100)$$,
  'SH-1    visitors cannot add products', '42501');
select tests.throws($$update public.products set price_usd = 100$$, 'SH-2    visitors cannot change prices', '42501');
select tests.eq(tests.count($$select 1 from public.shop_pages$$), 0::bigint, 'AD-8.6  unpublished policy pages are hidden');
select tests.eq(tests.count($$select 1 from storage.objects where bucket_id = 'products'$$), 0::bigint, 'AC-8.8  visitors cannot list product files');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('products', 'upload.zip')$$,
  'AC-8.8  visitors cannot upload product files');

-- ---------------------------------------------------------------------------
-- signed-in stranger
-- ---------------------------------------------------------------------------
select tests.login('22222222-2222-4222-8222-222222222222');
select tests.eq(tests.count($$select 1 from public.product_files$$), 0::bigint, 'SH-1    strangers see no file locations');
select tests.eq(tests.count($$select 1 from public.orders$$), 0::bigint, 'SH-1    strangers see no orders');
select tests.eq(tests.rows($$update public.orders set downloads_used = 0$$), 0::bigint, 'SH-1    strangers cannot reset downloads');
select tests.throws($$insert into public.orders (product_title, email, status, token_hash) values ('LUT pack', 'me@example.com', 'free', repeat('c', 64))$$,
  'SH-1    strangers cannot create orders', '42501');
select tests.eq(tests.rows($$update public.products set price_usd = 100$$), 0::bigint, 'SH-2    strangers cannot change prices');
select tests.eq(tests.count($$select 1 from storage.objects where bucket_id = 'products'$$), 0::bigint, 'AC-8.8  strangers cannot list product files');

-- ---------------------------------------------------------------------------
-- owner
-- ---------------------------------------------------------------------------
select tests.login('11111111-1111-4111-8111-111111111111');
select tests.eq(tests.count($$select 1 from public.products$$), 3::bigint, 'AD-8.1  the owner sees every product');
select tests.eq(tests.count($$select 1 from public.product_files$$), 1::bigint, 'AD-8.1  the owner sees file locations');
select tests.lives($$insert into public.product_files (product_id, external_url, file_name) values ('a8000000-0000-4000-8000-000000000003', 'https://drive.example.com/free.zip', 'free.zip')$$,
  'CO-8    the owner can attach an external link');
select tests.eq(tests.count($$select 1 from public.orders$$), 1::bigint, 'AD-8.3  the owner reads orders');
select tests.eq(tests.rows($$update public.orders set status = 'revoked' where id = 'a8100000-0000-4000-8000-000000000001'$$), 1::bigint, 'AD-8.4  the owner can revoke an order');
select tests.eq(tests.rows($$update public.orders set downloads_used = 0, expires_at = now() + interval '30 days'$$), 1::bigint, 'AD-8.4  the owner can reset downloads');
select tests.throws($$update public.orders set email = 'other@example.com'$$, 'SH-1    the owner cannot rewrite who bought', '42501');
select tests.throws($$update public.orders set amount = 0$$, 'SH-1    the owner cannot rewrite amounts', '42501');
select tests.throws($$insert into public.orders (product_title, email, status, token_hash) values ('X', 'x@example.com', 'paid', repeat('d', 64))$$,
  'SH-1    orders are created only by the server', '42501');
select tests.throws($$update public.orders set token_hash = repeat('e', 64)$$, 'SH-4    the owner cannot swap download tokens', '42501');
select tests.throws($$delete from public.orders$$, 'SH-1    orders are kept (no deletes through the API)', '42501');
select tests.throws($$select * from public.shop_events$$, 'SH-3    provider events are server-only, even for the owner', '42501');
select tests.eq(tests.rows($$update public.shop_pages set body = 'Edited', is_published = true where slug = 'terms'$$), 1::bigint, 'AD-8.6  the owner edits and publishes policies');
select tests.eq(tests.count($$select 1 from storage.objects where bucket_id = 'products'$$), 1::bigint, 'AD-8.1  the owner sees product files');
select tests.lives($$insert into storage.objects (bucket_id, name) values ('products', 'new-pack.zip')$$, 'AD-8.1  the owner uploads product files');

select tests.lives($$select public.reorder('products', array['a8000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000001']::uuid[])$$,
  'AD-8.1  the owner can reorder products');
select tests.eq((select sort_order from public.products where id = 'a8000000-0000-4000-8000-000000000001'), 1, 'AD-8.1  reorder sets the new order');

select tests.login_anon();
select tests.eq(tests.count($$select 1 from public.shop_pages where slug = 'terms'$$), 1::bigint, 'AD-8.6  published policies are public');
select tests.throws($$select public.reorder('products', '{}'::uuid[])$$, 'SH-1    visitors cannot reorder products', '42501');
reset role;
