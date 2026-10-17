-- Part 9 · 0011 — traffic analytics, error reports, keep-alive (spec 09 §2.2, §2.6, §3.2)
--
-- Visitors can only *add* rows, through public.track() and public.report_error(); everything
-- they send is checked and shortened. Nothing here is readable through the API except by the
-- owner, through the report functions below.
--
--   * no cookies: a visitor is a hash of (IP, browser, the day's secret salt); the salt
--     changes every day and old salts are deleted, so nobody can be followed across days
--   * IP addresses and full user agents are never stored
--   * limits: 300 events per visitor per hour, 50,000 per day for the whole site;
--     error reports 20 per visitor per hour, 2,000 per day
--   * public.keep_alive() is called once a day by the site's scheduled function: it keeps the
--     free project awake and tidies up (daily totals, 13-month retention)
--
-- Safe to run more than once. Run it in the Supabase SQL Editor after 0010.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists private.analytics_salt (
  day  date primary key,
  salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);

create table if not exists private.analytics_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  name          text not null check (name in (
                  'page_view', 'buy_click', 'checkout_return', 'free_claim', 'download',
                  'contact_sent', 'resume_open', 'code_link')),
  path          text not null check (path like '/%' and char_length(path) <= 300),
  product_id    uuid,
  detail        text check (char_length(detail) <= 40),
  referrer_host text check (char_length(referrer_host) <= 120),
  source        text not null check (char_length(source) <= 120),
  utm_source    text check (char_length(utm_source) <= 80),
  utm_medium    text check (char_length(utm_medium) <= 80),
  utm_campaign  text check (char_length(utm_campaign) <= 80),
  country       text check (country ~ '^[A-Z]{2}$'),
  device        text not null check (device in ('phone', 'tablet', 'desktop')),
  browser       text not null check (char_length(browser) <= 20),
  visitor       text not null check (visitor ~ '^[0-9a-f]{64}$')
);
create index if not exists analytics_events_time on private.analytics_events (created_at);
create index if not exists analytics_events_name on private.analytics_events (name, created_at);
create index if not exists analytics_events_visitor on private.analytics_events (visitor, created_at);

-- daily totals, kept after the raw events are deleted (TR-11)
create table if not exists private.analytics_daily (
  day      date not null,
  dim      text not null check (dim in ('total', 'page', 'source', 'country')),
  value    text not null,
  visitors int not null,
  views    int not null,
  primary key (day, dim, value)
);

create table if not exists private.maintenance_state (
  id         int primary key default 1 check (id = 1),
  last_run   date,
  rolled_to  date
);
insert into private.maintenance_state (id) values (1) on conflict (id) do nothing;

-- the country of each IANA time zone (from the tz database), for when the network gives none
create table if not exists private.tz_country (
  tz      text primary key,
  country text not null check (country ~ '^[A-Z]{2}$')
);

create table if not exists private.error_groups (
  fingerprint text primary key,
  message     text not null,
  stack       text,
  path        text,
  browser     text,
  release     text,
  count       int not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved    boolean not null default false
);

create table if not exists private.error_throttle (
  visitor    text not null,
  created_at timestamptz not null default now()
);
create index if not exists error_throttle_visitor on private.error_throttle (visitor, created_at);

revoke all on all tables in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (private)
-- ---------------------------------------------------------------------------
create or replace function private.request_header(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim((nullif(current_setting('request.headers', true), '')::json) ->> p_name), '');
$$;

create or replace function private.is_bot(ua text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select ua is null
      or ua ~* '(bot|crawl|spider|slurp|archiver|facebookexternalhit|whatsapp|telegram|skype|preview|headless|lighthouse|pagespeed|python|curl|wget|httpclient|okhttp|java/|go-http|node-fetch|axios|postman|monitor|uptime|pingdom)';
$$;

create or replace function private.ua_device(ua text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when ua ~* '(ipad|tablet|playbook|silk)' or (ua ~* 'android' and ua !~* 'mobile') then 'tablet'
    when ua ~* '(mobi|iphone|ipod|android|blackberry|opera mini|iemobile)' then 'phone'
    else 'desktop'
  end;
$$;

create or replace function private.ua_browser(ua text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when ua ~* 'edg(e|a|ios)?/' then 'Edge'
    when ua ~* 'samsungbrowser' then 'Samsung Internet'
    when ua ~* '(opr/|opera)' then 'Opera'
    when ua ~* '(firefox|fxios)/' then 'Firefox'
    when ua ~* '(chrome|crios|chromium)/' then 'Chrome'
    when ua ~* 'safari/' then 'Safari'
    else 'Other'
  end;
$$;

-- Sources grouped as people think of them (TR-8); unknown sites keep their host name.
create or replace function private.source_of(p_host text, p_utm text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when s ~ '^(instagram|ig)' or h ~ '(^|\.)instagram\.com$' then 'Instagram'
    when s ~ '^(youtube|yt)' or h ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'YouTube'
    when s ~ '^linkedin' or h ~ '(^|\.)(linkedin\.com|lnkd\.in)$' then 'LinkedIn'
    when s ~ '^(whatsapp|wa)$' or h ~ '(^|\.)(whatsapp\.com|wa\.me)$' then 'WhatsApp'
    when s ~ '^(twitter|x)$' or h ~ '(^|\.)(twitter\.com|x\.com|t\.co)$' then 'X'
    when s ~ '^(facebook|fb)' or h ~ '(^|\.)(facebook\.com|fb\.me|fb\.com)$' then 'Facebook'
    when s ~ '^github' or h ~ '(^|\.)github\.com$' then 'GitHub'
    when s ~ '^google' or h ~ '(^|\.)google\.[a-z.]+$' then 'Google'
    when s ~ '^bing' or h ~ '(^|\.)bing\.com$' then 'Bing'
    when s ~ '^duckduckgo' or h ~ '(^|\.)duckduckgo\.com$' then 'DuckDuckGo'
    when s ~ '^reddit' or h ~ '(^|\.)reddit\.com$' then 'Reddit'
    when s <> '' then left(initcap(s), 40)
    when h <> '' then left(h, 120)
    else 'Direct'
  end
  from (select lower(btrim(coalesce(p_utm, ''))) as s,
               regexp_replace(lower(btrim(coalesce(p_host, ''))), '^(www\.|m\.|l\.|lm\.)', '') as h) as x;
$$;

-- Today's visitor code: hash of (salt of the day, IP, browser). Old salts are dropped.
create or replace function private.visitor_hash()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salt text;
begin
  insert into private.analytics_salt (day) values (current_date) on conflict (day) do nothing;
  select salt into v_salt from private.analytics_salt where day = current_date;
  return encode(sha256(convert_to(
    v_salt || '|' || coalesce(private.request_ip(), '') || '|' ||
    coalesce(private.request_header('user-agent'), ''), 'UTF8')), 'hex');
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recording (visitors)
-- ---------------------------------------------------------------------------
create or replace function public.track(
  p_name         text,
  p_path         text,
  p_referrer     text default null,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_product      uuid default null,
  p_detail       text default null,
  p_tz           text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ua      text := private.request_header('user-agent');
  v_visitor text;
  v_country text;
  v_path    text := left(btrim(coalesce(p_path, '')), 300);
  v_host    text := nullif(left(lower(btrim(coalesce(p_referrer, ''))), 120), '');
begin
  if p_name is null or p_name not in ('page_view', 'buy_click', 'checkout_return', 'free_claim',
      'download', 'contact_sent', 'resume_open', 'code_link') then
    raise exception 'bad_event' using errcode = 'PT422';
  end if;
  if v_path not like '/%' then
    raise exception 'bad_path' using errcode = 'PT422';
  end if;
  -- never the admin, bots or scripts (TR-4)
  if v_path like '/admin%' or private.is_bot(v_ua) then
    return;
  end if;

  v_visitor := private.visitor_hash();

  -- limits (TR-6): quietly drop the extra events
  if (select count(*) from private.analytics_events
       where visitor = v_visitor and created_at > now() - interval '1 hour') >= 300
     or (select count(*) from private.analytics_events
       where created_at > now() - interval '1 day') >= 50000 then
    return;
  end if;

  -- country: the network's, else the browser's time zone (Q2)
  v_country := upper(private.request_header('cf-ipcountry'));
  if v_country is null or v_country !~ '^[A-Z]{2}$' or v_country in ('XX', 'T1') then
    select country into v_country from private.tz_country where tz = left(p_tz, 64);
  end if;

  insert into private.analytics_events (
    name, path, product_id, detail, referrer_host, source,
    utm_source, utm_medium, utm_campaign, country, device, browser, visitor
  ) values (
    p_name, v_path, p_product, nullif(left(p_detail, 40), ''), v_host,
    private.source_of(v_host, p_utm_source),
    nullif(left(btrim(p_utm_source), 80), ''), nullif(left(btrim(p_utm_medium), 80), ''),
    nullif(left(btrim(p_utm_campaign), 80), ''),
    v_country, private.ua_device(v_ua), private.ua_browser(v_ua), v_visitor
  );
end;
$$;

revoke execute on function public.track(text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.track(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

-- Errors from the site and the admin (OP-3), grouped by message and first stack line.
create or replace function public.report_error(
  p_message text,
  p_stack   text default null,
  p_path    text default null,
  p_release text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ua      text := private.request_header('user-agent');
  v_visitor text;
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_stack   text := left(p_stack, 4000);
  v_fp      text;
begin
  if v_message = '' or private.is_bot(v_ua) then
    return;
  end if;
  v_visitor := private.visitor_hash();
  delete from private.error_throttle where created_at < now() - interval '1 day';
  if (select count(*) from private.error_throttle
       where visitor = v_visitor and created_at > now() - interval '1 hour') >= 20
     or (select count(*) from private.error_throttle) >= 2000 then
    return;
  end if;
  insert into private.error_throttle (visitor) values (v_visitor);

  v_fp := encode(sha256(convert_to(
    v_message || '|' || coalesce(split_part(btrim(coalesce(v_stack, '')), E'\n', 2), ''), 'UTF8')), 'hex');
  insert into private.error_groups as g (fingerprint, message, stack, path, browser, release)
  values (v_fp, v_message, v_stack, left(p_path, 300), private.ua_browser(v_ua), left(p_release, 40))
  on conflict (fingerprint) do update
    set count = g.count + 1,
        last_seen = now(),
        path = excluded.path,
        browser = excluded.browser,
        release = excluded.release,
        resolved = false;
end;
$$;

revoke execute on function public.report_error(text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep-alive and tidying (OP-1, TR-11); safe to call any number of times
-- ---------------------------------------------------------------------------
create or replace function public.keep_alive()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.maintenance_state;
  v_from  date;
begin
  select * into v_state from private.maintenance_state where id = 1 for update;
  if v_state.last_run = current_date then
    return 'ok';
  end if;

  -- daily totals for every finished day not rolled up yet
  v_from := coalesce(v_state.rolled_to + 1,
                     (select min(created_at)::date from private.analytics_events),
                     current_date);
  insert into private.analytics_daily (day, dim, value, visitors, views)
  select d, dim, value, count(distinct visitor), count(*) filter (where name = 'page_view')
    from (
      select created_at::date as d, 'total' as dim, '' as value, visitor, name from private.analytics_events
      union all
      select created_at::date, 'page', path, visitor, name from private.analytics_events where name = 'page_view'
      union all
      select created_at::date, 'source', source, visitor, name from private.analytics_events
      union all
      select created_at::date, 'country', coalesce(country, '??'), visitor, name from private.analytics_events
    ) as e
   where d >= v_from and d < current_date
   group by d, dim, value
  on conflict (day, dim, value) do update
    set visitors = excluded.visitors, views = excluded.views;

  delete from private.analytics_events where created_at < now() - interval '13 months';
  delete from private.analytics_salt where day < current_date - 1;
  delete from private.error_throttle where created_at < now() - interval '1 day';

  update private.maintenance_state
     set last_run = current_date, rolled_to = current_date - 1
   where id = 1;
  return 'ok';
end;
$$;

revoke execute on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports (owner only, two-factor like the rest of the admin)
-- ---------------------------------------------------------------------------
create or replace function private.require_owner()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_owner() from public, anon, authenticated;

-- Everything the Traffic page shows for one period (TR-7, TR-8).
-- p_tz groups the days in the admin's time zone; p_path / p_source filter everything.
create or replace function public.traffic_report(
  p_from   timestamptz,
  p_to     timestamptz,
  p_tz     text default 'UTC',
  p_path   text default null,
  p_source text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz   text := coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz), 'UTC');
  v_len  interval := p_to - p_from;
  v_out  jsonb;
begin
  perform private.require_owner();
  if p_to <= p_from or v_len > interval '400 days' then
    raise exception 'bad_range' using errcode = 'PT422';
  end if;

  with ev as (
    select * from private.analytics_events
     where created_at >= p_from and created_at < p_to
       and (p_path is null or path = p_path)
       and (p_source is null or source = p_source)
  ),
  prev as (
    select * from private.analytics_events
     where created_at >= p_from - v_len and created_at < p_from
       and (p_path is null or path = p_path)
       and (p_source is null or source = p_source)
  ),
  days as (
    select generate_series(
      (p_from at time zone v_tz)::date,
      ((p_to - interval '1 second') at time zone v_tz)::date,
      interval '1 day')::date as d
  ),
  per_day as (
    select (created_at at time zone v_tz)::date as d,
           count(distinct visitor) as visitors,
           count(*) filter (where name = 'page_view') as views
      from ev group by 1
  )
  select jsonb_build_object(
    'visitors', (select count(distinct visitor) from ev),
    'views', (select count(*) from ev where name = 'page_view'),
    'prev_visitors', (select count(distinct visitor) from prev),
    'prev_views', (select count(*) from prev where name = 'page_view'),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', days.d, 'visitors', coalesce(p.visitors, 0), 'views', coalesce(p.views, 0)) order by days.d)
        from days left join per_day p on p.d = days.d), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(x order by x.views desc, x.key) from (
        select path as key, count(*) as views, count(distinct visitor) as visitors
          from ev where name = 'page_view' group by path order by 2 desc, 1 limit 25) as x), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(x order by x.visitors desc, x.key) from (
        select source as key, count(*) filter (where name = 'page_view') as views, count(distinct visitor) as visitors
          from ev group by source order by 3 desc, 1 limit 25) as x), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(x order by x.visitors desc, x.key) from (
        select utm_campaign as key, min(source) as source, count(*) filter (where name = 'page_view') as views,
               count(distinct visitor) as visitors
          from ev where utm_campaign is not null group by utm_campaign order by 4 desc, 1 limit 25) as x), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(x order by x.visitors desc, x.key) from (
        select coalesce(country, '??') as key, count(*) filter (where name = 'page_view') as views,
               count(distinct visitor) as visitors
          from ev group by 1 order by 3 desc, 1 limit 25) as x), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(x order by x.visitors desc, x.key) from (
        select device as key, count(*) filter (where name = 'page_view') as views, count(distinct visitor) as visitors
          from ev group by device) as x), '[]'::jsonb),
    'browsers', coalesce((
      select jsonb_agg(x order by x.visitors desc, x.key) from (
        select browser as key, count(*) filter (where name = 'page_view') as views, count(distinct visitor) as visitors
          from ev group by browser) as x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- Visitors in the last 5 minutes (Q9).
create or replace function public.traffic_now()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  return (select count(distinct visitor)::int from private.analytics_events
           where created_at > now() - interval '5 minutes');
end;
$$;

-- Views → buy clicks → paid orders per product (TR-9).
create or replace function public.shop_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  perform private.require_owner();
  with ev as (
    select * from private.analytics_events where created_at >= p_from and created_at < p_to
  ),
  f as (
    select p.id, p.title, p.slug, p.is_free,
           (select count(*) from ev where ev.name = 'page_view' and ev.path = '/shop/' || p.slug) as views,
           (select count(*) from ev where ev.name = 'buy_click' and ev.product_id = p.id) as buy_clicks,
           (select count(*) from ev where ev.name = 'free_claim' and ev.product_id = p.id) as free_claims,
           (select count(*) from ev where ev.name = 'code_link' and ev.product_id = p.id) as code_links,
           (select count(*) from public.orders o
             where o.product_id = p.id and o.status = 'paid' and o.created_at >= p_from and o.created_at < p_to) as orders,
           coalesce((select jsonb_object_agg(currency, total) from (
              select o.currency, sum(o.amount) as total from public.orders o
               where o.product_id = p.id and o.status = 'paid' and o.created_at >= p_from and o.created_at < p_to
               group by o.currency) as r), '{}'::jsonb) as revenue
      from public.products p
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.views desc, f.title), '[]'::jsonb)
    into v_out
    from f
   where views + buy_clicks + free_claims + code_links + orders > 0
      or exists (select 1 from public.products q where q.id = f.id and q.is_published);
  return v_out;
end;
$$;

-- Storage used by analytics (risk table: the free plan's 500 MB).
create or replace function public.traffic_size()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  return pg_catalog.pg_total_relation_size('private.analytics_events')
       + pg_catalog.pg_total_relation_size('private.analytics_daily');
end;
$$;

create or replace function public.error_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  return coalesce((select jsonb_agg(to_jsonb(g) order by g.resolved, g.last_seen desc)
                     from (select * from private.error_groups order by last_seen desc limit 200) as g), '[]'::jsonb);
end;
$$;

create or replace function public.error_resolve(p_fingerprint text, p_resolved boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  update private.error_groups set resolved = p_resolved where fingerprint = p_fingerprint;
end;
$$;

create or replace function public.error_clear_resolved()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_owner();
  delete from private.error_groups where resolved;
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.traffic_report(timestamptz, timestamptz, text, text, text)',
    'public.traffic_now()',
    'public.shop_funnel(timestamptz, timestamptz)',
    'public.traffic_size()',
    'public.error_list()',
    'public.error_resolve(text, boolean)',
    'public.error_clear_resolved()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privacy page: add the analytics paragraph if the page is still the untouched template (TR-12)
-- ---------------------------------------------------------------------------
update public.shop_pages
   set body = body || E'\n\n' || $md$**Analytics.** To see which pages are visited we count page views without cookies. We record the page, the site that linked here, the country, the kind of device and browser, and the time. We don't store IP addresses: a visitor is counted with a code made from the connection and a secret that changes every day, so visits can't be linked across days or to a person. Browsers that send "Do Not Track" or "Global Privacy Control" aren't counted. Details are deleted after 13 months; only daily totals are kept.$md$
 where slug = 'privacy'
   and body not ilike '%analytics%'
   and body like '> **Review before publishing.**%we never see your card details.%'
   and position('Ask through the contact form and we''ll delete your details' in body) > 0;

-- ---------------------------------------------------------------------------
-- Time zone → country (tz database zone.tab plus its aliases)
-- ---------------------------------------------------------------------------
insert into private.tz_country (tz, country) values
  ('Africa/Abidjan', 'CI'),
  ('Africa/Accra', 'GH'),
  ('Africa/Addis_Ababa', 'ET'),
  ('Africa/Algiers', 'DZ'),
  ('Africa/Asmara', 'ER'),
  ('Africa/Asmera', 'ER'),
  ('Africa/Bamako', 'ML'),
  ('Africa/Bangui', 'CF'),
  ('Africa/Banjul', 'GM'),
  ('Africa/Bissau', 'GW'),
  ('Africa/Blantyre', 'MW'),
  ('Africa/Brazzaville', 'CG'),
  ('Africa/Bujumbura', 'BI'),
  ('Africa/Cairo', 'EG'),
  ('Africa/Casablanca', 'MA'),
  ('Africa/Ceuta', 'ES'),
  ('Africa/Conakry', 'GN'),
  ('Africa/Dakar', 'SN'),
  ('Africa/Dar_es_Salaam', 'TZ'),
  ('Africa/Djibouti', 'DJ'),
  ('Africa/Douala', 'CM'),
  ('Africa/El_Aaiun', 'EH'),
  ('Africa/Freetown', 'SL'),
  ('Africa/Gaborone', 'BW'),
  ('Africa/Harare', 'ZW'),
  ('Africa/Johannesburg', 'ZA'),
  ('Africa/Juba', 'SS'),
  ('Africa/Kampala', 'UG'),
  ('Africa/Khartoum', 'SD'),
  ('Africa/Kigali', 'RW'),
  ('Africa/Kinshasa', 'CD'),
  ('Africa/Lagos', 'NG'),
  ('Africa/Libreville', 'GA'),
  ('Africa/Lome', 'TG'),
  ('Africa/Luanda', 'AO'),
  ('Africa/Lubumbashi', 'CD'),
  ('Africa/Lusaka', 'ZM'),
  ('Africa/Malabo', 'GQ'),
  ('Africa/Maputo', 'MZ'),
  ('Africa/Maseru', 'LS'),
  ('Africa/Mbabane', 'SZ'),
  ('Africa/Mogadishu', 'SO'),
  ('Africa/Monrovia', 'LR'),
  ('Africa/Nairobi', 'KE'),
  ('Africa/Ndjamena', 'TD'),
  ('Africa/Niamey', 'NE'),
  ('Africa/Nouakchott', 'MR'),
  ('Africa/Ouagadougou', 'BF'),
  ('Africa/Porto-Novo', 'BJ'),
  ('Africa/Sao_Tome', 'ST'),
  ('Africa/Timbuktu', 'ML'),
  ('Africa/Tripoli', 'LY'),
  ('Africa/Tunis', 'TN'),
  ('Africa/Windhoek', 'NA'),
  ('America/Adak', 'US'),
  ('America/Anchorage', 'US'),
  ('America/Anguilla', 'AI'),
  ('America/Antigua', 'AG'),
  ('America/Araguaina', 'BR'),
  ('America/Argentina/Buenos_Aires', 'AR'),
  ('America/Argentina/Catamarca', 'AR'),
  ('America/Argentina/ComodRivadavia', 'AR'),
  ('America/Argentina/Cordoba', 'AR'),
  ('America/Argentina/Jujuy', 'AR'),
  ('America/Argentina/La_Rioja', 'AR'),
  ('America/Argentina/Mendoza', 'AR'),
  ('America/Argentina/Rio_Gallegos', 'AR'),
  ('America/Argentina/Salta', 'AR'),
  ('America/Argentina/San_Juan', 'AR'),
  ('America/Argentina/San_Luis', 'AR'),
  ('America/Argentina/Tucuman', 'AR'),
  ('America/Argentina/Ushuaia', 'AR'),
  ('America/Aruba', 'AW'),
  ('America/Asuncion', 'PY'),
  ('America/Atikokan', 'CA'),
  ('America/Atka', 'US'),
  ('America/Bahia', 'BR'),
  ('America/Bahia_Banderas', 'MX'),
  ('America/Barbados', 'BB'),
  ('America/Belem', 'BR'),
  ('America/Belize', 'BZ'),
  ('America/Blanc-Sablon', 'CA'),
  ('America/Boa_Vista', 'BR'),
  ('America/Bogota', 'CO'),
  ('America/Boise', 'US'),
  ('America/Buenos_Aires', 'AR'),
  ('America/Cambridge_Bay', 'CA'),
  ('America/Campo_Grande', 'BR'),
  ('America/Cancun', 'MX'),
  ('America/Caracas', 'VE'),
  ('America/Catamarca', 'AR'),
  ('America/Cayenne', 'GF'),
  ('America/Cayman', 'KY'),
  ('America/Chicago', 'US'),
  ('America/Chihuahua', 'MX'),
  ('America/Ciudad_Juarez', 'MX'),
  ('America/Coral_Harbour', 'CA'),
  ('America/Cordoba', 'AR'),
  ('America/Costa_Rica', 'CR'),
  ('America/Coyhaique', 'CL'),
  ('America/Creston', 'CA'),
  ('America/Cuiaba', 'BR'),
  ('America/Curacao', 'CW'),
  ('America/Danmarkshavn', 'GL'),
  ('America/Dawson', 'CA'),
  ('America/Dawson_Creek', 'CA'),
  ('America/Denver', 'US'),
  ('America/Detroit', 'US'),
  ('America/Dominica', 'DM'),
  ('America/Edmonton', 'CA'),
  ('America/Eirunepe', 'BR'),
  ('America/El_Salvador', 'SV'),
  ('America/Ensenada', 'MX'),
  ('America/Fort_Nelson', 'CA'),
  ('America/Fort_Wayne', 'US'),
  ('America/Fortaleza', 'BR'),
  ('America/Glace_Bay', 'CA'),
  ('America/Godthab', 'GL'),
  ('America/Goose_Bay', 'CA'),
  ('America/Grand_Turk', 'TC'),
  ('America/Grenada', 'GD'),
  ('America/Guadeloupe', 'GP'),
  ('America/Guatemala', 'GT'),
  ('America/Guayaquil', 'EC'),
  ('America/Guyana', 'GY'),
  ('America/Halifax', 'CA'),
  ('America/Havana', 'CU'),
  ('America/Hermosillo', 'MX'),
  ('America/Indiana/Indianapolis', 'US'),
  ('America/Indiana/Knox', 'US'),
  ('America/Indiana/Marengo', 'US'),
  ('America/Indiana/Petersburg', 'US'),
  ('America/Indiana/Tell_City', 'US'),
  ('America/Indiana/Vevay', 'US'),
  ('America/Indiana/Vincennes', 'US'),
  ('America/Indiana/Winamac', 'US'),
  ('America/Indianapolis', 'US'),
  ('America/Inuvik', 'CA'),
  ('America/Iqaluit', 'CA'),
  ('America/Jamaica', 'JM'),
  ('America/Jujuy', 'AR'),
  ('America/Juneau', 'US'),
  ('America/Kentucky/Louisville', 'US'),
  ('America/Kentucky/Monticello', 'US'),
  ('America/Knox_IN', 'US'),
  ('America/Kralendijk', 'BQ'),
  ('America/La_Paz', 'BO'),
  ('America/Lima', 'PE'),
  ('America/Los_Angeles', 'US'),
  ('America/Louisville', 'US'),
  ('America/Lower_Princes', 'SX'),
  ('America/Maceio', 'BR'),
  ('America/Managua', 'NI'),
  ('America/Manaus', 'BR'),
  ('America/Marigot', 'MF'),
  ('America/Martinique', 'MQ'),
  ('America/Matamoros', 'MX'),
  ('America/Mazatlan', 'MX'),
  ('America/Mendoza', 'AR'),
  ('America/Menominee', 'US'),
  ('America/Merida', 'MX'),
  ('America/Metlakatla', 'US'),
  ('America/Mexico_City', 'MX'),
  ('America/Miquelon', 'PM'),
  ('America/Moncton', 'CA'),
  ('America/Monterrey', 'MX'),
  ('America/Montevideo', 'UY'),
  ('America/Montreal', 'CA'),
  ('America/Montserrat', 'MS'),
  ('America/Nassau', 'BS'),
  ('America/New_York', 'US'),
  ('America/Nipigon', 'CA'),
  ('America/Nome', 'US'),
  ('America/Noronha', 'BR'),
  ('America/North_Dakota/Beulah', 'US'),
  ('America/North_Dakota/Center', 'US'),
  ('America/North_Dakota/New_Salem', 'US'),
  ('America/Nuuk', 'GL'),
  ('America/Ojinaga', 'MX'),
  ('America/Panama', 'PA'),
  ('America/Pangnirtung', 'CA'),
  ('America/Paramaribo', 'SR'),
  ('America/Phoenix', 'US'),
  ('America/Port-au-Prince', 'HT'),
  ('America/Port_of_Spain', 'TT'),
  ('America/Porto_Acre', 'BR'),
  ('America/Porto_Velho', 'BR'),
  ('America/Puerto_Rico', 'PR'),
  ('America/Punta_Arenas', 'CL'),
  ('America/Rainy_River', 'CA'),
  ('America/Rankin_Inlet', 'CA'),
  ('America/Recife', 'BR'),
  ('America/Regina', 'CA'),
  ('America/Resolute', 'CA'),
  ('America/Rio_Branco', 'BR'),
  ('America/Rosario', 'AR'),
  ('America/Santa_Isabel', 'MX'),
  ('America/Santarem', 'BR'),
  ('America/Santiago', 'CL'),
  ('America/Santo_Domingo', 'DO'),
  ('America/Sao_Paulo', 'BR'),
  ('America/Scoresbysund', 'GL'),
  ('America/Shiprock', 'US'),
  ('America/Sitka', 'US'),
  ('America/St_Barthelemy', 'BL'),
  ('America/St_Johns', 'CA'),
  ('America/St_Kitts', 'KN'),
  ('America/St_Lucia', 'LC'),
  ('America/St_Thomas', 'VI'),
  ('America/St_Vincent', 'VC'),
  ('America/Swift_Current', 'CA'),
  ('America/Tegucigalpa', 'HN'),
  ('America/Thule', 'GL'),
  ('America/Thunder_Bay', 'CA'),
  ('America/Tijuana', 'MX'),
  ('America/Toronto', 'CA'),
  ('America/Tortola', 'VG'),
  ('America/Vancouver', 'CA'),
  ('America/Virgin', 'VI'),
  ('America/Whitehorse', 'CA'),
  ('America/Winnipeg', 'CA'),
  ('America/Yakutat', 'US'),
  ('America/Yellowknife', 'CA'),
  ('Antarctica/Casey', 'AQ'),
  ('Antarctica/Davis', 'AQ'),
  ('Antarctica/DumontDUrville', 'AQ'),
  ('Antarctica/Macquarie', 'AU'),
  ('Antarctica/Mawson', 'AQ'),
  ('Antarctica/McMurdo', 'AQ'),
  ('Antarctica/Palmer', 'AQ'),
  ('Antarctica/Rothera', 'AQ'),
  ('Antarctica/South_Pole', 'AQ'),
  ('Antarctica/Syowa', 'AQ'),
  ('Antarctica/Troll', 'AQ'),
  ('Antarctica/Vostok', 'AQ'),
  ('Arctic/Longyearbyen', 'SJ'),
  ('Asia/Aden', 'YE'),
  ('Asia/Almaty', 'KZ'),
  ('Asia/Amman', 'JO'),
  ('Asia/Anadyr', 'RU'),
  ('Asia/Aqtau', 'KZ'),
  ('Asia/Aqtobe', 'KZ'),
  ('Asia/Ashgabat', 'TM'),
  ('Asia/Ashkhabad', 'TM'),
  ('Asia/Atyrau', 'KZ'),
  ('Asia/Baghdad', 'IQ'),
  ('Asia/Bahrain', 'BH'),
  ('Asia/Baku', 'AZ'),
  ('Asia/Bangkok', 'TH'),
  ('Asia/Barnaul', 'RU'),
  ('Asia/Beirut', 'LB'),
  ('Asia/Bishkek', 'KG'),
  ('Asia/Brunei', 'BN'),
  ('Asia/Calcutta', 'IN'),
  ('Asia/Chita', 'RU'),
  ('Asia/Choibalsan', 'MN'),
  ('Asia/Chongqing', 'CN'),
  ('Asia/Chungking', 'CN'),
  ('Asia/Colombo', 'LK'),
  ('Asia/Dacca', 'BD'),
  ('Asia/Damascus', 'SY'),
  ('Asia/Dhaka', 'BD'),
  ('Asia/Dili', 'TL'),
  ('Asia/Dubai', 'AE'),
  ('Asia/Dushanbe', 'TJ'),
  ('Asia/Famagusta', 'CY'),
  ('Asia/Gaza', 'PS'),
  ('Asia/Harbin', 'CN'),
  ('Asia/Hebron', 'PS'),
  ('Asia/Ho_Chi_Minh', 'VN'),
  ('Asia/Hong_Kong', 'HK'),
  ('Asia/Hovd', 'MN'),
  ('Asia/Irkutsk', 'RU'),
  ('Asia/Istanbul', 'TR'),
  ('Asia/Jakarta', 'ID'),
  ('Asia/Jayapura', 'ID'),
  ('Asia/Jerusalem', 'IL'),
  ('Asia/Kabul', 'AF'),
  ('Asia/Kamchatka', 'RU'),
  ('Asia/Karachi', 'PK'),
  ('Asia/Kashgar', 'CN'),
  ('Asia/Kathmandu', 'NP'),
  ('Asia/Katmandu', 'NP'),
  ('Asia/Khandyga', 'RU'),
  ('Asia/Kolkata', 'IN'),
  ('Asia/Krasnoyarsk', 'RU'),
  ('Asia/Kuala_Lumpur', 'MY'),
  ('Asia/Kuching', 'MY'),
  ('Asia/Kuwait', 'KW'),
  ('Asia/Macao', 'MO'),
  ('Asia/Macau', 'MO'),
  ('Asia/Magadan', 'RU'),
  ('Asia/Makassar', 'ID'),
  ('Asia/Manila', 'PH'),
  ('Asia/Muscat', 'OM'),
  ('Asia/Nicosia', 'CY'),
  ('Asia/Novokuznetsk', 'RU'),
  ('Asia/Novosibirsk', 'RU'),
  ('Asia/Omsk', 'RU'),
  ('Asia/Oral', 'KZ'),
  ('Asia/Phnom_Penh', 'KH'),
  ('Asia/Pontianak', 'ID'),
  ('Asia/Pyongyang', 'KP'),
  ('Asia/Qatar', 'QA'),
  ('Asia/Qostanay', 'KZ'),
  ('Asia/Qyzylorda', 'KZ'),
  ('Asia/Rangoon', 'MM'),
  ('Asia/Riyadh', 'SA'),
  ('Asia/Saigon', 'VN'),
  ('Asia/Sakhalin', 'RU'),
  ('Asia/Samarkand', 'UZ'),
  ('Asia/Seoul', 'KR'),
  ('Asia/Shanghai', 'CN'),
  ('Asia/Singapore', 'SG'),
  ('Asia/Srednekolymsk', 'RU'),
  ('Asia/Taipei', 'TW'),
  ('Asia/Tashkent', 'UZ'),
  ('Asia/Tbilisi', 'GE'),
  ('Asia/Tehran', 'IR'),
  ('Asia/Tel_Aviv', 'IL'),
  ('Asia/Thimbu', 'BT'),
  ('Asia/Thimphu', 'BT'),
  ('Asia/Tokyo', 'JP'),
  ('Asia/Tomsk', 'RU'),
  ('Asia/Ujung_Pandang', 'ID'),
  ('Asia/Ulaanbaatar', 'MN'),
  ('Asia/Ulan_Bator', 'MN'),
  ('Asia/Urumqi', 'CN'),
  ('Asia/Ust-Nera', 'RU'),
  ('Asia/Vientiane', 'LA'),
  ('Asia/Vladivostok', 'RU'),
  ('Asia/Yakutsk', 'RU'),
  ('Asia/Yangon', 'MM'),
  ('Asia/Yekaterinburg', 'RU'),
  ('Asia/Yerevan', 'AM'),
  ('Atlantic/Azores', 'PT'),
  ('Atlantic/Bermuda', 'BM'),
  ('Atlantic/Canary', 'ES'),
  ('Atlantic/Cape_Verde', 'CV'),
  ('Atlantic/Faeroe', 'FO'),
  ('Atlantic/Faroe', 'FO'),
  ('Atlantic/Jan_Mayen', 'NO'),
  ('Atlantic/Madeira', 'PT'),
  ('Atlantic/Reykjavik', 'IS'),
  ('Atlantic/South_Georgia', 'GS'),
  ('Atlantic/St_Helena', 'SH'),
  ('Atlantic/Stanley', 'FK'),
  ('Australia/ACT', 'AU'),
  ('Australia/Adelaide', 'AU'),
  ('Australia/Brisbane', 'AU'),
  ('Australia/Broken_Hill', 'AU'),
  ('Australia/Canberra', 'AU'),
  ('Australia/Currie', 'AU'),
  ('Australia/Darwin', 'AU'),
  ('Australia/Eucla', 'AU'),
  ('Australia/Hobart', 'AU'),
  ('Australia/LHI', 'AU'),
  ('Australia/Lindeman', 'AU'),
  ('Australia/Lord_Howe', 'AU'),
  ('Australia/Melbourne', 'AU'),
  ('Australia/NSW', 'AU'),
  ('Australia/North', 'AU'),
  ('Australia/Perth', 'AU'),
  ('Australia/Queensland', 'AU'),
  ('Australia/South', 'AU'),
  ('Australia/Sydney', 'AU'),
  ('Australia/Tasmania', 'AU'),
  ('Australia/Victoria', 'AU'),
  ('Australia/West', 'AU'),
  ('Australia/Yancowinna', 'AU'),
  ('Brazil/Acre', 'BR'),
  ('Brazil/DeNoronha', 'BR'),
  ('Brazil/East', 'BR'),
  ('Brazil/West', 'BR'),
  ('Canada/Atlantic', 'CA'),
  ('Canada/Central', 'CA'),
  ('Canada/Eastern', 'CA'),
  ('Canada/Mountain', 'CA'),
  ('Canada/Newfoundland', 'CA'),
  ('Canada/Pacific', 'CA'),
  ('Canada/Saskatchewan', 'CA'),
  ('Canada/Yukon', 'CA'),
  ('Chile/Continental', 'CL'),
  ('Chile/EasterIsland', 'CL'),
  ('Cuba', 'CU'),
  ('Egypt', 'EG'),
  ('Eire', 'IE'),
  ('Europe/Amsterdam', 'NL'),
  ('Europe/Andorra', 'AD'),
  ('Europe/Astrakhan', 'RU'),
  ('Europe/Athens', 'GR'),
  ('Europe/Belfast', 'GB'),
  ('Europe/Belgrade', 'RS'),
  ('Europe/Berlin', 'DE'),
  ('Europe/Bratislava', 'SK'),
  ('Europe/Brussels', 'BE'),
  ('Europe/Bucharest', 'RO'),
  ('Europe/Budapest', 'HU'),
  ('Europe/Busingen', 'DE'),
  ('Europe/Chisinau', 'MD'),
  ('Europe/Copenhagen', 'DK'),
  ('Europe/Dublin', 'IE'),
  ('Europe/Gibraltar', 'GI'),
  ('Europe/Guernsey', 'GG'),
  ('Europe/Helsinki', 'FI'),
  ('Europe/Isle_of_Man', 'IM'),
  ('Europe/Istanbul', 'TR'),
  ('Europe/Jersey', 'JE'),
  ('Europe/Kaliningrad', 'RU'),
  ('Europe/Kiev', 'UA'),
  ('Europe/Kirov', 'RU'),
  ('Europe/Kyiv', 'UA'),
  ('Europe/Lisbon', 'PT'),
  ('Europe/Ljubljana', 'SI'),
  ('Europe/London', 'GB'),
  ('Europe/Luxembourg', 'LU'),
  ('Europe/Madrid', 'ES'),
  ('Europe/Malta', 'MT'),
  ('Europe/Mariehamn', 'AX'),
  ('Europe/Minsk', 'BY'),
  ('Europe/Monaco', 'MC'),
  ('Europe/Moscow', 'RU'),
  ('Europe/Nicosia', 'CY'),
  ('Europe/Oslo', 'NO'),
  ('Europe/Paris', 'FR'),
  ('Europe/Podgorica', 'ME'),
  ('Europe/Prague', 'CZ'),
  ('Europe/Riga', 'LV'),
  ('Europe/Rome', 'IT'),
  ('Europe/Samara', 'RU'),
  ('Europe/San_Marino', 'SM'),
  ('Europe/Sarajevo', 'BA'),
  ('Europe/Saratov', 'RU'),
  ('Europe/Simferopol', 'UA'),
  ('Europe/Skopje', 'MK'),
  ('Europe/Sofia', 'BG'),
  ('Europe/Stockholm', 'SE'),
  ('Europe/Tallinn', 'EE'),
  ('Europe/Tirane', 'AL'),
  ('Europe/Tiraspol', 'MD'),
  ('Europe/Ulyanovsk', 'RU'),
  ('Europe/Uzhgorod', 'UA'),
  ('Europe/Vaduz', 'LI'),
  ('Europe/Vatican', 'VA'),
  ('Europe/Vienna', 'AT'),
  ('Europe/Vilnius', 'LT'),
  ('Europe/Volgograd', 'RU'),
  ('Europe/Warsaw', 'PL'),
  ('Europe/Zagreb', 'HR'),
  ('Europe/Zaporozhye', 'UA'),
  ('Europe/Zurich', 'CH'),
  ('GB', 'GB'),
  ('GB-Eire', 'GB'),
  ('Hongkong', 'HK'),
  ('Iceland', 'IS'),
  ('Indian/Antananarivo', 'MG'),
  ('Indian/Chagos', 'IO'),
  ('Indian/Christmas', 'CX'),
  ('Indian/Cocos', 'CC'),
  ('Indian/Comoro', 'KM'),
  ('Indian/Kerguelen', 'TF'),
  ('Indian/Mahe', 'SC'),
  ('Indian/Maldives', 'MV'),
  ('Indian/Mauritius', 'MU'),
  ('Indian/Mayotte', 'YT'),
  ('Indian/Reunion', 'RE'),
  ('Iran', 'IR'),
  ('Israel', 'IL'),
  ('Jamaica', 'JM'),
  ('Japan', 'JP'),
  ('Kwajalein', 'MH'),
  ('Libya', 'LY'),
  ('Mexico/BajaNorte', 'MX'),
  ('Mexico/BajaSur', 'MX'),
  ('Mexico/General', 'MX'),
  ('NZ', 'NZ'),
  ('NZ-CHAT', 'NZ'),
  ('Navajo', 'US'),
  ('PRC', 'CN'),
  ('Pacific/Apia', 'WS'),
  ('Pacific/Auckland', 'NZ'),
  ('Pacific/Bougainville', 'PG'),
  ('Pacific/Chatham', 'NZ'),
  ('Pacific/Chuuk', 'FM'),
  ('Pacific/Easter', 'CL'),
  ('Pacific/Efate', 'VU'),
  ('Pacific/Enderbury', 'KI'),
  ('Pacific/Fakaofo', 'TK'),
  ('Pacific/Fiji', 'FJ'),
  ('Pacific/Funafuti', 'TV'),
  ('Pacific/Galapagos', 'EC'),
  ('Pacific/Gambier', 'PF'),
  ('Pacific/Guadalcanal', 'SB'),
  ('Pacific/Guam', 'GU'),
  ('Pacific/Honolulu', 'US'),
  ('Pacific/Johnston', 'US'),
  ('Pacific/Kanton', 'KI'),
  ('Pacific/Kiritimati', 'KI'),
  ('Pacific/Kosrae', 'FM'),
  ('Pacific/Kwajalein', 'MH'),
  ('Pacific/Majuro', 'MH'),
  ('Pacific/Marquesas', 'PF'),
  ('Pacific/Midway', 'UM'),
  ('Pacific/Nauru', 'NR'),
  ('Pacific/Niue', 'NU'),
  ('Pacific/Norfolk', 'NF'),
  ('Pacific/Noumea', 'NC'),
  ('Pacific/Pago_Pago', 'AS'),
  ('Pacific/Palau', 'PW'),
  ('Pacific/Pitcairn', 'PN'),
  ('Pacific/Pohnpei', 'FM'),
  ('Pacific/Ponape', 'FM'),
  ('Pacific/Port_Moresby', 'PG'),
  ('Pacific/Rarotonga', 'CK'),
  ('Pacific/Saipan', 'MP'),
  ('Pacific/Samoa', 'AS'),
  ('Pacific/Tahiti', 'PF'),
  ('Pacific/Tarawa', 'KI'),
  ('Pacific/Tongatapu', 'TO'),
  ('Pacific/Truk', 'FM'),
  ('Pacific/Wake', 'UM'),
  ('Pacific/Wallis', 'WF'),
  ('Pacific/Yap', 'FM'),
  ('Poland', 'PL'),
  ('Portugal', 'PT'),
  ('ROC', 'TW'),
  ('ROK', 'KR'),
  ('Singapore', 'SG'),
  ('Turkey', 'TR'),
  ('US/Alaska', 'US'),
  ('US/Aleutian', 'US'),
  ('US/Arizona', 'US'),
  ('US/Central', 'US'),
  ('US/East-Indiana', 'US'),
  ('US/Eastern', 'US'),
  ('US/Hawaii', 'US'),
  ('US/Indiana-Starke', 'US'),
  ('US/Michigan', 'US'),
  ('US/Mountain', 'US'),
  ('US/Pacific', 'US'),
  ('US/Samoa', 'AS'),
  ('W-SU', 'RU')
on conflict (tz) do update set country = excluded.country;
