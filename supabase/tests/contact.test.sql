-- Part 7 contact-form protection (spec 07 AC-7.8 – AC-7.10). Included from rls.test.sql,
-- inside its transaction, so it uses the same helpers and is rolled back with it.

reset role;
delete from private.contact_throttle;

create function tests.as_visitor(ip text) returns void language sql as $$
  select tests.login_anon(),
         set_config('request.headers',
                    case when ip is null then '' else json_build_object('x-forwarded-for', ip || ', 10.0.0.1')::text end,
                    true);
$$;

create function tests.send(email text, body text default 'Hello there, this is a message.') returns void
language plpgsql as $$
begin
  insert into public.messages (name, email, body) values ('Visitor', email, body);
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- per visitor: 3 per 10 minutes
-- ---------------------------------------------------------------------------
select tests.as_visitor('203.0.113.7');
select tests.lives($$select tests.send('a1@example.com')$$, 'AC-7.8  1st message from a visitor is stored');
select tests.lives($$select tests.send('a2@example.com')$$, 'AC-7.8  2nd message from a visitor is stored');
select tests.lives($$select tests.send('a3@example.com')$$, 'AC-7.8  3rd message from a visitor is stored');
select tests.throws($$select tests.send('a4@example.com')$$, 'AC-7.8  4th message within 10 minutes is refused (rate_limited)', 'PT429');

select tests.as_visitor('198.51.100.9');
select tests.lives($$select tests.send('b1@example.com')$$, 'AC-7.8  another visitor is not affected');

-- per visitor: 10 per day (age the first visitor's rows past 10 minutes)
reset role;
update private.contact_throttle set created_at = now() - interval '1 hour';
insert into private.contact_throttle (ip_hash, email, created_at)
select ip_hash, 'old' || g || '@example.com', now() - interval '2 hours'
  from (select ip_hash from private.contact_throttle where email = 'a1@example.com') as t,
       generate_series(1, 6) as g; -- 3 + 6 = 9 today from that visitor
select tests.as_visitor('203.0.113.7');
select tests.lives($$select tests.send('a5@example.com')$$, 'AC-7.8  10th message of the day from a visitor is stored');
reset role;
update private.contact_throttle set created_at = now() - interval '1 hour' where email = 'a5@example.com';
select tests.as_visitor('203.0.113.7');
select tests.throws($$select tests.send('a6@example.com')$$, 'AC-7.8  11th message of the day from a visitor is refused', 'PT429');

-- ---------------------------------------------------------------------------
-- per sender email: 5 per day (from different connections)
-- ---------------------------------------------------------------------------
select tests.as_visitor('192.0.2.1');  select tests.lives($$select tests.send('Same@Example.com')$$, 'AC-7.8  per-email: 1st');
select tests.as_visitor('192.0.2.2');  select tests.lives($$select tests.send('same@example.com')$$, 'AC-7.8  per-email: 2nd');
select tests.as_visitor('192.0.2.3');  select tests.lives($$select tests.send('same@example.com')$$, 'AC-7.8  per-email: 3rd');
select tests.as_visitor('192.0.2.4');  select tests.lives($$select tests.send('same@example.com')$$, 'AC-7.8  per-email: 4th');
select tests.as_visitor('192.0.2.5');  select tests.lives($$select tests.send('same@example.com')$$, 'AC-7.8  per-email: 5th');
select tests.as_visitor('192.0.2.6');
select tests.throws($$select tests.send('SAME@example.com')$$, 'AC-7.8  6th message of the day from one email is refused (any case)', 'PT429');

-- ---------------------------------------------------------------------------
-- without an IP header only the email and site-wide limits apply
-- ---------------------------------------------------------------------------
select tests.as_visitor(null);
select tests.lives($$select tests.send('noip1@example.com')$$, 'AC-7.8  no IP header: message stored');
select tests.lives($$select tests.send('noip2@example.com')$$, 'AC-7.8  no IP header: 2nd stored');
select tests.lives($$select tests.send('noip3@example.com')$$, 'AC-7.8  no IP header: 3rd stored');
select tests.lives($$select tests.send('noip4@example.com')$$, 'AC-7.8  no IP header: 4th stored (no per-visitor limit)');

-- ---------------------------------------------------------------------------
-- signed-in users are limited too
-- ---------------------------------------------------------------------------
select tests.login('22222222-2222-4222-8222-222222222222'::uuid);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7"}', true);
select tests.throws($$select tests.send('signed-in@example.com')$$, 'AC-7.10 signed-in users get the same limits', 'PT429');

-- ---------------------------------------------------------------------------
-- site-wide: 100 per day
-- ---------------------------------------------------------------------------
reset role;
insert into private.contact_throttle (ip_hash, email)
select 'x' || g, 'flood' || g || '@example.com' from generate_series(1, 100 - (select count(*) from private.contact_throttle where created_at > now() - interval '1 day')) as g;
select tests.as_visitor('100.64.0.1');
select tests.throws($$select tests.send('fresh@example.com')$$, 'AC-7.8  the 101st message of the day for the whole site is refused', 'PT429');

-- old counting rows are removed after 2 days
reset role;
delete from private.contact_throttle where email like 'flood%';
insert into private.contact_throttle (ip_hash, email, created_at) values ('old', 'ancient@example.com', now() - interval '3 days');
select tests.as_visitor('100.64.0.2');
select tests.lives($$select tests.send('fresh2@example.com')$$, 'AC-7.8  site-wide limit frees up');
reset role;
select tests.eq((select count(*) from private.contact_throttle where email = 'ancient@example.com'), 0::bigint, 'SP-4    counting rows older than 2 days are deleted');

-- ---------------------------------------------------------------------------
-- content rules
-- ---------------------------------------------------------------------------
select tests.as_visitor('100.64.0.3');
select tests.throws($$select tests.send('links@example.com', 'See https://a.io https://b.io http://c.io www.d.io https://e.io https://f.io')$$,
  'AC-7.9  more than 5 links is refused (too_many_links)', 'PT422');
select tests.lives($$select tests.send('links@example.com', 'See https://a.io https://b.io http://c.io www.d.io https://e.io')$$,
  'AC-7.9  5 links are fine');
reset role;
select tests.ok(exists (select 1 from public.messages where email = 'same@example.com') and not exists (select 1 from public.messages where email <> lower(email)),
  'AC-7.9  emails are stored lower-case');
select tests.ok(not exists (select 1 from public.messages where body <> btrim(body) or name <> btrim(name)), 'SP-5    name and body are trimmed');

-- ---------------------------------------------------------------------------
-- privacy and access
-- ---------------------------------------------------------------------------
select tests.ok(not exists (
  select 1 from private.contact_throttle
   where ip_hash like '%203.0.113.7%' or ip_hash like '%192.0.2.%' or ip_hash like '%198.51.100.9%'),
  'AC-7.9  no raw IP is stored');
select tests.ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'messages' and column_name ilike '%ip%'),
  'AC-7.9  messages have no IP column');
select tests.ok((select count(*) from private.contact_throttle where ip_hash ~ '^[0-9a-f]{64}$') > 0, 'SP-4    visitors are kept as SHA-256 hashes');

select tests.as_visitor('100.64.0.4');
select tests.throws($$select * from private.contact_throttle$$, 'AC-7.10 visitors cannot read the counting table', '42501');
select tests.throws($$select * from private.contact_salt$$, 'AC-7.10 visitors cannot read the salt', '42501');
select tests.throws($$delete from private.contact_throttle$$, 'AC-7.10 visitors cannot clear the counting table', '42501');
select tests.throws($$select private.request_ip()$$, 'AC-7.10 visitors cannot call the private functions', '42501');
select tests.throws($$alter table public.messages disable trigger check_message$$, 'AC-7.10 visitors cannot switch the check off', '42501');
select tests.throws($$select * from public.messages$$, 'AC-7.10 visitors still cannot read messages', '42501');

select tests.login('22222222-2222-4222-8222-222222222222'::uuid);
select tests.throws($$select * from private.contact_throttle$$, 'AC-7.10 signed-in strangers cannot read the counting table', '42501');

-- data loaded by the database owner (seed, SQL editor) is not counted or limited
reset role;
select set_config('request.headers', '', true);
delete from private.contact_throttle;
insert into public.messages (name, email, body)
select 'Seed', 'seed@example.com', 'Loaded by the database owner.' from generate_series(1, 8);
select tests.eq((select count(*) from private.contact_throttle), 0::bigint, 'SP-3    owner inserts are not limited or counted');
