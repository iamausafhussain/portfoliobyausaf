-- Part 7 · 0009 — contact form protection (spec 07 §2.3 SP-3 – SP-6, §3.2)
--
-- A check that runs before every new message is stored:
--   * limits: per visitor 3 per 10 minutes and 10 per day; per sender email 5 per day;
--     the whole site 100 per day
--   * the visitor is recognised by their IP address, kept only as a salted one-way hash and
--     deleted after 2 days
--   * content rules: name, body and email tidied; at most 5 links in the body
--
-- Refusals carry a short message the site turns into friendly text:
--   rate_limited  (HTTP 429)    too_many_links  (HTTP 422)
--
-- Safe to run more than once. Run it in the Supabase SQL Editor after 0008.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One secret, made once, never readable through the API.
create table if not exists private.contact_salt (
  id   int primary key default 1 check (id = 1),
  salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
insert into private.contact_salt (id) values (1) on conflict (id) do nothing;

-- One row per stored message, for counting. No raw IPs, no message content.
create table if not exists private.contact_throttle (
  id         bigint generated always as identity primary key,
  ip_hash    text,
  email      text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_throttle_ip on private.contact_throttle (ip_hash, created_at);
create index if not exists contact_throttle_email on private.contact_throttle (email, created_at);
create index if not exists contact_throttle_time on private.contact_throttle (created_at);

revoke all on all tables in schema private from public, anon, authenticated;

-- The visitor's IP from the headers Supabase passes to the database (null when absent).
create or replace function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    h ->> 'x-real-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1)
  )), '')
  from (select nullif(current_setting('request.headers', true), '')::json as h) as r;
$$;

create or replace function private.check_message()
returns trigger
language plpgsql
security definer -- reads and writes the private tables; visitors have no rights on them
set search_path = ''
as $$
declare
  v_role  text := coalesce(nullif(current_setting('role', true), ''), 'none');
  v_ip    text := private.request_ip();
  v_hash  text;
  v_links int;
begin
  -- tidy what the visitor typed
  new.name    := btrim(new.name);
  new.email   := lower(btrim(new.email));
  new.subject := btrim(coalesce(new.subject, ''));
  new.body    := btrim(new.body);
  new.budget  := nullif(btrim(coalesce(new.budget, '')), '');

  -- at most 5 links in the body
  select count(*) into v_links
    from regexp_matches(new.body, '(https?://|www\.)', 'gi');
  if v_links > 5 then
    raise exception 'too_many_links' using errcode = 'PT422',
      hint = 'A message can contain at most 5 links.';
  end if;

  -- limits apply to messages sent through the API (visitors and signed-in users), not to
  -- the database owner loading data by hand
  if v_role in ('anon', 'authenticated') then
    delete from private.contact_throttle where created_at < now() - interval '2 days';

    if v_ip is not null then
      select encode(sha256(convert_to(s.salt || '|' || v_ip, 'UTF8')), 'hex') into v_hash
        from private.contact_salt as s where s.id = 1;

      if (select count(*) from private.contact_throttle
           where ip_hash = v_hash and created_at > now() - interval '10 minutes') >= 3
         or (select count(*) from private.contact_throttle
           where ip_hash = v_hash and created_at > now() - interval '1 day') >= 10 then
        raise exception 'rate_limited' using errcode = 'PT429',
          hint = 'Too many messages from this connection. Please try again later.';
      end if;
    end if;

    if (select count(*) from private.contact_throttle
         where email = new.email and created_at > now() - interval '1 day') >= 5
       or (select count(*) from private.contact_throttle
         where created_at > now() - interval '1 day') >= 100 then
      raise exception 'rate_limited' using errcode = 'PT429',
        hint = 'Too many messages right now. Please try again later.';
    end if;

    insert into private.contact_throttle (ip_hash, email) values (v_hash, new.email);
  end if;

  return new;
end;
$$;

revoke execute on function private.check_message() from public, anon, authenticated;
revoke execute on function private.request_ip() from public, anon, authenticated;

drop trigger if exists check_message on public.messages;
create trigger check_message
  before insert on public.messages
  for each row execute function private.check_message();
