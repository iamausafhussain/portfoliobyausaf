-- Part 9 traffic analytics and error reports (spec 09 AC-9.3, AC-9.4, AC-9.9). Included from
-- rls.test.sql after the shop tests, inside its transaction, so it reuses the products and orders.

reset role;
delete from private.analytics_events;
delete from private.error_groups;
delete from private.error_throttle;

create function tests.as_browser(ip text, ua text, country text default null) returns void language sql as $$
  select tests.login_anon(),
         set_config('request.headers',
                    json_build_object('x-forwarded-for', ip, 'user-agent', ua, 'cf-ipcountry', country)::text,
                    true);
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- recording
-- ---------------------------------------------------------------------------
select tests.as_browser('203.0.113.7',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
select tests.lives($$select public.track('page_view', '/', 'l.instagram.com', null, null, null, null, null, 'Asia/Calcutta')$$,
  'TR-1   a visitor can record a page view');
select tests.lives($$select public.track('page_view', '/shop/lut-pack', null, 'youtube', 'video', 'diwali', null, null, 'Asia/Kolkata')$$,
  'TR-1   …and one with a UTM campaign');
select tests.lives($$select public.track('buy_click', '/shop/lut-pack', null, null, null, null, 'a8000000-0000-4000-8000-000000000001', null, null)$$,
  'TR-3   …and a buy click');
select tests.throws($$select public.track('purchase', '/')$$, 'TR-6   unknown event names are refused', 'PT422');
select tests.throws($$select public.track('page_view', 'https://evil.example/')$$, 'TR-6   paths must be site paths', 'PT422');
select tests.throws($$select count(*) from private.analytics_events$$, 'AC-9.4 visitors can''t read analytics', '42501');
select tests.throws($$select public.traffic_report(now() - interval '1 day', now())$$, 'AC-9.4 visitors can''t run reports', '42501');
select tests.throws($$select public.error_list()$$, 'AC-9.4 visitors can''t read error reports', '42501');

reset role;
select tests.eq((select count(*) from private.analytics_events), 3::bigint, 'TR-1   three events stored');
select tests.eq((select string_agg(distinct device || '/' || browser || '/' || country, ',') from private.analytics_events),
  'phone/Safari/IN', 'TR-1   device, browser and country (from the time zone)');
select tests.eq((select source from private.analytics_events where referrer_host is not null), 'Instagram',
  'TR-8   l.instagram.com counts as Instagram');
select tests.eq((select source || '/' || utm_campaign from private.analytics_events where utm_campaign is not null),
  'YouTube/diwali', 'TR-8   utm_source=youtube counts as YouTube, with its campaign');
select tests.eq((select count(distinct visitor) from private.analytics_events), 1::bigint,
  'TR-2   one visitor across their page views');
select tests.ok(not exists (
  select 1 from private.analytics_events
   where visitor like '%203.0.113.7%' or path like '%203.0.113%'
      or browser like '%Mozilla%' or coalesce(referrer_host, '') like '%/%'),
  'AC-9.3 no IP, full user agent or full referrer stored');
select tests.ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'private' and table_name = 'analytics_events' and column_name ~ '(ip|user_agent|ua)$'),
  'AC-9.3 the events table has no column for IPs or user agents');

-- the network's country wins over the time zone; another visitor; a desktop browser
select tests.as_browser('198.51.100.9',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0', 'DE');
select public.track('page_view', '/projects/edi', 'www.google.com', null, null, null, null, null, 'Asia/Kolkata');
reset role;
select tests.eq((select country || '/' || device || '/' || browser || '/' || source from private.analytics_events where path = '/projects/edi'),
  'DE/desktop/Edge/Google', 'TR-1   network country, desktop Edge, Google');
select tests.eq((select count(distinct visitor) from private.analytics_events), 2::bigint, 'TR-2   two different visitors');

-- not recorded: bots, the admin
select tests.as_browser('192.0.2.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
select public.track('page_view', '/');
select tests.as_browser('192.0.2.2', 'WhatsApp/2.23 A');
select public.track('page_view', '/shop/lut-pack');
select tests.as_browser('203.0.113.7', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
select public.track('page_view', '/admin/orders');
reset role;
select tests.eq((select count(*) from private.analytics_events), 4::bigint, 'TR-4   bots, link previews and admin pages aren''t recorded');

-- the visitor code changes with the day's salt (nobody can be followed across days)
reset role;
update private.analytics_salt set day = current_date - 1 where day = current_date;
select tests.as_browser('203.0.113.7',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
select public.track('page_view', '/');
reset role;
select tests.eq((select count(distinct visitor) from private.analytics_events where path = '/'), 2::bigint,
  'TR-2   the same visitor gets a new code on a new day');

-- per-visitor limit: 300 an hour
select tests.as_browser('198.51.100.9',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0', 'DE');
select public.track('page_view', '/limit-test');
reset role;
insert into private.analytics_events (name, path, source, device, browser, visitor)
select 'page_view', '/bulk', 'Direct', 'desktop', 'Chrome', (select visitor from private.analytics_events where path = '/limit-test')
  from generate_series(1, 299);
select tests.as_browser('198.51.100.9',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0', 'DE');
select tests.lives($$select public.track('page_view', '/shop')$$, 'TR-6   over the hourly limit nothing breaks…');
reset role;
select tests.eq((select count(*) from private.analytics_events where path = '/shop'), 0::bigint, 'TR-6   …and nothing is stored');
delete from private.analytics_events where path in ('/limit-test', '/bulk');

-- ---------------------------------------------------------------------------
-- reports (owner, two-factor)
-- ---------------------------------------------------------------------------
select tests.login('22222222-2222-4222-8222-222222222222');
select tests.throws($$select public.traffic_report(now() - interval '1 day', now() + interval '1 minute')$$,
  'AC-9.4 a signed-in stranger can''t run reports', '42501');
select tests.login('11111111-1111-4111-8111-111111111111', 'aal1');
select tests.throws($$select public.traffic_now()$$, 'AC-9.4 the owner needs the two-factor session', '42501');
select tests.login('11111111-1111-4111-8111-111111111111');
select tests.eq((select (public.traffic_report(now() - interval '1 day', now() + interval '1 minute', 'Asia/Kolkata') ->> 'views')::int),
  4, 'TR-7   page views in the period');
select tests.eq((select (public.traffic_report(now() - interval '1 day', now() + interval '1 minute', 'Asia/Kolkata') ->> 'visitors')::int),
  3, 'TR-7   visitors in the period (one returned the next "day")');
select tests.eq((select public.traffic_report(now() - interval '1 day', now() + interval '1 minute', 'Asia/Kolkata', null, 'Instagram') ->> 'views'),
  '1', 'TR-8   filtering by source');
select tests.eq((select public.traffic_report(now() - interval '1 day', now() + interval '1 minute', 'UTC') -> 'pages' -> 0 ->> 'key'),
  '/', 'TR-8   top page first');
select tests.ok((select jsonb_array_length(public.traffic_report(now() - interval '7 days', now(), 'UTC') -> 'series') between 7 and 8),
  'TR-7   one point per day in the chart');
select tests.eq(public.traffic_now(), 3, 'Q9     visitors right now');
select tests.eq((select (f ->> 'buy_clicks')::int from jsonb_array_elements(public.shop_funnel(now() - interval '1 day', now() + interval '1 minute')) as f
                  where f ->> 'slug' = 'lut-pack'), 1, 'TR-9   shop funnel counts buy clicks');
select tests.eq((select (f ->> 'views')::int from jsonb_array_elements(public.shop_funnel(now() - interval '1 day', now() + interval '1 minute')) as f
                  where f ->> 'slug' = 'lut-pack'), 1, 'TR-9   …and product page views');
select tests.ok(public.traffic_size() > 0, 'risk   storage used is reported');
select tests.throws($$select public.traffic_report(now(), now() - interval '1 day')$$, 'TR-7   a backwards range is refused', 'PT422');

-- ---------------------------------------------------------------------------
-- error reports (OP-3)
-- ---------------------------------------------------------------------------
select tests.as_browser('203.0.113.7', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
select public.report_error('TypeError: x is undefined', E'TypeError: x is undefined\n    at Globe (Globe.ts:10:5)', '/', 'abc123');
select public.report_error('TypeError: x is undefined', E'TypeError: x is undefined\n    at Globe (Globe.ts:10:5)', '/shop', 'abc123');
select public.report_error('Other failure', null, '/', 'abc123');
reset role;
select tests.eq((select count(*) from private.error_groups), 2::bigint, 'OP-3   repeated errors are grouped');
select tests.eq((select count from private.error_groups where message like 'TypeError%'), 2, 'OP-3   …and counted');
select tests.login('11111111-1111-4111-8111-111111111111');
select tests.eq(jsonb_array_length(public.error_list()), 2, 'OP-3   the owner sees the error list');
select public.error_resolve((select e ->> 'fingerprint' from jsonb_array_elements(public.error_list()) e where e ->> 'message' = 'Other failure'));
select tests.eq(public.error_clear_resolved(), 1, 'OP-3   resolved errors can be cleared');
select tests.as_browser('203.0.113.7', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
select public.report_error('Flood', null, '/', null) from generate_series(1, 30);
reset role;
select tests.eq((select count from private.error_groups where message = 'Flood'), 17,
  'OP-3   at most 20 reports per visitor per hour');

-- ---------------------------------------------------------------------------
-- keep-alive and tidying (OP-1, TR-11)
-- ---------------------------------------------------------------------------
reset role;
insert into private.analytics_events (created_at, name, path, source, device, browser, visitor) values
  (now() - interval '14 months', 'page_view', '/old', 'Direct', 'desktop', 'Chrome', repeat('a', 64)),
  (now() - interval '2 days', 'page_view', '/projects/edi', 'Google', 'desktop', 'Chrome', repeat('b', 64));
update private.maintenance_state set last_run = null, rolled_to = null;
select tests.login_anon();
select tests.eq(public.keep_alive(), 'ok', 'OP-1   visitors (the scheduled ping) can call keep_alive');
select tests.eq(public.keep_alive(), 'ok', 'OP-1   …any number of times');
reset role;
select tests.eq((select count(*) from private.analytics_events where path = '/old'), 0::bigint,
  'TR-11  events older than 13 months are deleted');
select tests.ok(exists (select 1 from private.analytics_daily
                         where dim = 'page' and value = '/projects/edi' and day = (now() - interval '2 days')::date),
  'TR-11  daily totals are kept');
select tests.ok(not exists (select 1 from private.analytics_salt where day < current_date - 1),
  'TR-2   old salts are deleted');
