-- Schema and security tests for Part 1 (spec 01 §5, AC-1.1 – AC-1.20).
-- Run with `npm run db:test`. Everything happens inside one transaction that is rolled back.
--
-- Roles are switched the same way Supabase's API does it:
--   anon          → role anon, no JWT
--   stranger      → role authenticated, JWT sub = a user who is NOT the owner
--   owner         → role authenticated, JWT sub = the user in app_owner

\set ON_ERROR_STOP 1
\set QUIET 1
-- only NOTICE lines (one per check) are shown; query results are discarded
\o /dev/null
set client_min_messages = notice;

begin;

-- ===========================================================================
-- Test helpers
-- ===========================================================================
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.pass(name text) returns void language plpgsql as $$
begin
  perform set_config('tests.passed', (coalesce(nullif(current_setting('tests.passed', true), ''), '0')::int + 1)::text, false);
  raise notice 'ok   %', name;
end $$;

create function tests.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL %', name;
  end if;
  perform tests.pass(name);
end $$;

create function tests.eq(actual anyelement, expected anyelement, name text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', name, expected, actual;
  end if;
  perform tests.pass(name);
end $$;

-- statement must raise an error (optionally with a specific SQLSTATE)
create function tests.throws(stmt text, name text, code text default null) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if code is not null and sqlstate <> code then
      raise exception 'FAIL % — expected SQLSTATE %, got % (%)', name, code, sqlstate, sqlerrm;
    end if;
    perform tests.pass(name);
    return;
  end;
  raise exception 'FAIL % — no error raised by: %', name, stmt;
end $$;

-- statement must succeed
create function tests.lives(stmt text, name text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise exception 'FAIL % — % (%)', name, sqlerrm, sqlstate;
  end;
  perform tests.pass(name);
end $$;

-- number of rows a statement touches (or returns)
create function tests.rows(stmt text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

create function tests.count(q text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) as q', q) into n;
  return n;
end $$;

create function tests.login_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '', true);
$$;

-- aal2 = signed in with password AND authenticator code; aal1 = password only
create function tests.login(uid uuid, aal text default 'aal2') returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ===========================================================================
-- Fixtures (as postgres, which bypasses RLS)
-- ===========================================================================
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'stranger@example.test');

insert into public.app_owner (user_id) values ('11111111-1111-4111-8111-111111111111');

-- one published (p) and one unpublished (u) row in every content table
insert into public.hero_media (id, title, source_type, video_mp4, poster, is_published) values
  ('a0000000-0000-4000-8000-000000000001', 'Hero p', 'url', 'https://cdn.example.com/a.mp4', '{"path":"images/a.webp","alt":"A"}', true),
  ('a0000000-0000-4000-8000-000000000002', 'Hero u', 'upload', 'videos/hero/b.mp4', '{"path":"images/b.webp","alt":"B"}', false);

insert into public.projects (id, slug, title, summary, is_published) values
  ('b0000000-0000-4000-8000-000000000001', 'proj-p', 'Project p', 'Summary', true),
  ('b0000000-0000-4000-8000-000000000002', 'proj-u', 'Project u', 'Summary', false);

insert into public.achievements (id, title, is_published) values
  ('c0000000-0000-4000-8000-000000000001', 'Award p', true),
  ('c0000000-0000-4000-8000-000000000002', 'Award u', false);

insert into public.experience (id, company, role, start_date, is_published) values
  ('d0000000-0000-4000-8000-000000000001', 'Co p', 'Dev', '2023-01-01', true),
  ('d0000000-0000-4000-8000-000000000002', 'Co u', 'Dev', '2023-01-01', false);

insert into public.skills (id, name, category, is_published) values
  ('e0000000-0000-4000-8000-000000000001', 'Skill p', 'Backend', true),
  ('e0000000-0000-4000-8000-000000000002', 'Skill u', 'Backend', false);

insert into public.testimonials (id, quote, author_name, is_published) values
  ('f0000000-0000-4000-8000-000000000001', 'Quote p', 'Author', true),
  ('f0000000-0000-4000-8000-000000000002', 'Quote u', 'Author', false);

insert into public.custom_sections (id, name, slug, fields, is_published) values
  ('90000000-0000-4000-8000-000000000001', 'Sec p', 'sec-p', '[{"key":"title","label":"Title","type":"text","required":true}]', true),
  ('90000000-0000-4000-8000-000000000002', 'Sec u', 'sec-u', '[{"key":"title","label":"Title","type":"text","required":true}]', false);

insert into public.custom_items (id, section_id, data, is_published) values
  -- published item in a published section → visible
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '{"title":"x"}', true),
  -- unpublished item in a published section → hidden
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '{"title":"y"}', false),
  -- published item in an UNPUBLISHED section → hidden (AC-1.13)
  ('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '{"title":"z"}', true);

insert into public.messages (id, name, email, body) values
  ('92000000-0000-4000-8000-000000000001', 'Existing', 'a@example.com', 'An existing message body');

create temp table content_tables (t text, published_id uuid, insert_sql text);
grant select on content_tables to anon, authenticated;
insert into content_tables values
  ('hero_media', 'a0000000-0000-4000-8000-000000000001',
   $q$insert into public.hero_media (title, source_type, video_mp4, poster) values ('X', 'url', 'https://x.example.com/x.mp4', '{"path":"images/x.webp","alt":"X"}')$q$),
  ('projects', 'b0000000-0000-4000-8000-000000000001',
   $q$insert into public.projects (slug, title, summary) values ('new-proj', 'X', 'X')$q$),
  ('achievements', 'c0000000-0000-4000-8000-000000000001',
   $q$insert into public.achievements (title) values ('X')$q$),
  ('experience', 'd0000000-0000-4000-8000-000000000001',
   $q$insert into public.experience (company, role, start_date) values ('X', 'X', '2024-01-01')$q$),
  ('skills', 'e0000000-0000-4000-8000-000000000001',
   $q$insert into public.skills (name, category) values ('New skill', 'X')$q$),
  ('testimonials', 'f0000000-0000-4000-8000-000000000001',
   $q$insert into public.testimonials (quote, author_name) values ('X', 'X')$q$),
  ('custom_sections', '90000000-0000-4000-8000-000000000001',
   $q$insert into public.custom_sections (name, slug, fields) values ('X', 'new-sec', '[{"key":"a","label":"A","type":"text","required":true}]')$q$),
  ('custom_items', '91000000-0000-4000-8000-000000000001',
   $q$insert into public.custom_items (section_id, data) values ('90000000-0000-4000-8000-000000000001', '{}')$q$);

-- ===========================================================================
-- Schema rules (as postgres)  AC-1.1 – AC-1.11
-- ===========================================================================
select tests.ok(true, 'AC-1.1  migrations and seed applied (twice) before this file ran');

-- AC-1.2 single settings row
select tests.throws($$insert into public.site_settings (id) values (2)$$, 'AC-1.2  site_settings rejects id 2', '23514');
select tests.throws($$insert into public.site_settings (id) values (1)$$, 'AC-1.2  site_settings rejects a second id 1', '23505');

-- AC-1.3 single owner
select tests.throws($$insert into public.app_owner (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  'AC-1.3  app_owner rejects a second owner', '23505');

-- AC-1.4 slugs
select tests.throws($$insert into public.projects (slug, title, summary) values ('My Project', 'X', 'X')$$, 'AC-1.4  slug with spaces/capitals rejected', '23514');
select tests.throws($$insert into public.projects (slug, title, summary) values ('a--b', 'X', 'X')$$, 'AC-1.4  slug with double hyphen rejected', '23514');
select tests.throws($$insert into public.projects (slug, title, summary) values ('-a', 'X', 'X')$$, 'AC-1.4  slug with leading hyphen rejected', '23514');
select tests.throws($$insert into public.projects (slug, title, summary) values ('proj-p', 'X', 'X')$$, 'AC-1.4  duplicate project slug rejected', '23505');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'admin', '[{"key":"a","label":"A","type":"text","required":true}]')$$, 'AC-1.4  reserved section slug "admin" rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'resume', '[{"key":"a","label":"A","type":"text","required":true}]')$$, 'AC-1.4  reserved section slug "resume" rejected', '23514');
select tests.lives($$insert into public.projects (slug, title, summary) values ('edi-pipeline-2', 'X', 'X')$$, 'AC-1.4  valid slug accepted');

-- AC-1.5 length limits
select tests.throws(format($$insert into public.projects (slug, title, summary) values ('long-title', %L, 'X')$$, repeat('x', 101)), 'AC-1.5  title over 100 chars rejected', '23514');
select tests.throws(format($$insert into public.projects (slug, title, summary) values ('long-sum', 'X', %L)$$, repeat('x', 281)), 'AC-1.5  summary over 280 chars rejected', '23514');
select tests.throws(format($$insert into public.testimonials (quote, author_name) values (%L, 'X')$$, repeat('x', 601)), 'AC-1.5  quote over 600 chars rejected', '23514');
select tests.throws($$insert into public.projects (slug, title, summary) values ('blank', '   ', 'X')$$, 'AC-1.5  blank title rejected', '23514');
select tests.throws($$insert into public.messages (name, email, body) values ('X', 'x@example.com', 'too short')$$, 'AC-1.5  message body under 10 chars rejected', '23514');
select tests.throws($$insert into public.projects (slug, title, summary, tech) values ('many-tags', 'X', 'X', array_fill('t'::text, array[21]))$$, 'AC-1.5  more than 20 tech tags rejected', '23514');

-- AC-1.6 image references need alt text
select tests.throws($$update public.projects set cover = '{"path":"images/x.webp"}' where slug = 'proj-p'$$, 'AC-1.6  image without alt rejected', '23514');
select tests.throws($$update public.projects set cover = '{"path":"images/x.webp","alt":"  "}' where slug = 'proj-p'$$, 'AC-1.6  image with blank alt rejected', '23514');
select tests.throws($$update public.projects set cover = '{"path":"../etc/passwd","alt":"x"}' where slug = 'proj-p'$$, 'AC-1.6  image path with .. rejected', '23514');
select tests.throws($$update public.projects set cover = '{"path":"images/x.webp","alt":"x","onload":"evil"}' where slug = 'proj-p'$$, 'AC-1.6  image with unknown key rejected', '23514');
select tests.throws($$update public.projects set gallery = '[{"path":"images/x.webp"}]' where slug = 'proj-p'$$, 'AC-1.6  gallery image without alt rejected', '23514');
select tests.lives($$update public.projects set cover = '{"path":"images/x.webp","alt":"Screenshot","width":1600,"height":900} ' where slug = 'proj-p'$$, 'AC-1.6  valid image accepted');
select tests.lives($$update public.projects set cover = '{"path":"https://cdn.example.com/x.webp","alt":"Screenshot"}' where slug = 'proj-p'$$, 'AC-1.6  https image accepted');
select tests.throws($$insert into public.hero_media (title, source_type, video_mp4, poster) values ('X', 'url', 'https://x.example.com/x.mp4', '{"path":"images/x.webp"}')$$, 'AC-1.6  hero poster without alt rejected', '23514');

-- AC-1.7 experience dates
select tests.throws($$insert into public.experience (company, role, start_date, end_date) values ('X', 'X', '2024-05-01', '2024-04-30')$$, 'AC-1.7  end_date before start_date rejected', '23514');
select tests.lives($$insert into public.experience (company, role, start_date, end_date) values ('X', 'X', '2024-05-01', null)$$, 'AC-1.7  open-ended (current) job accepted');

-- AC-1.8 custom item data must be an object; field definitions validated
select tests.throws($$insert into public.custom_items (section_id, data) values ('90000000-0000-4000-8000-000000000001', '[]')$$, 'AC-1.8  custom item data array rejected', '23514');
select tests.throws($$insert into public.custom_items (section_id, data) values ('90000000-0000-4000-8000-000000000001', '"text"')$$, 'AC-1.8  custom item data string rejected', '23514');
select tests.throws(format($$insert into public.custom_items (section_id, data) values ('90000000-0000-4000-8000-000000000001', %L)$$, json_build_object('t', repeat('x', 52000))), 'AC-1.8  custom item data over 50 KB rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f1', '[]')$$, 'DM-7    section with no fields rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f2', '[{"key":"Bad Key","label":"A","type":"text","required":true}]')$$, 'DM-7    invalid field key rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f3', '[{"key":"a","label":"A","type":"text","required":true},{"key":"a","label":"B","type":"text","required":true}]')$$, 'DM-7    duplicate field key rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f4', '[{"key":"a","label":"A","type":"colour","required":true}]')$$, 'DM-7    unknown field type rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f5', '[{"key":"a","label":"A","type":"select","required":true}]')$$, 'DM-7    select without options rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f6', '[{"key":"a","label":"A","type":"text","required":true,"options":["x"]}]')$$, 'DM-7    options on a non-select field rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields) values ('X', 'f7', '[{"key":"a","label":"A","type":"text"}]')$$, 'DM-7    field without "required" rejected', '23514');
select tests.throws($$insert into public.custom_sections (name, slug, fields, insert_after) values ('X', 'f8', '[{"key":"a","label":"A","type":"text","required":true}]', 'contact')$$, 'DM-7    section after contact rejected', '23514');
select tests.lives($$insert into public.custom_sections (name, slug, fields) values ('X', 'f9', '[{"key":"a","label":"A","type":"select","required":false,"options":["One","Two"],"help":"Pick one"}]')$$, 'DM-7    valid select field accepted');

-- Other value rules
select tests.throws($$insert into public.hero_media (title, source_type, video_mp4, poster) values ('X', 'url', 'videos/a.mp4', '{"path":"images/x.webp","alt":"X"}')$$, 'HM-2    url source with a storage path rejected', '23514');
select tests.throws($$insert into public.hero_media (title, source_type, video_mp4, poster) values ('X', 'upload', 'https://x.example.com/a.mp4', '{"path":"images/x.webp","alt":"X"}')$$, 'HM-2    upload source with a URL rejected', '23514');
select tests.throws($$insert into public.hero_media (title, source_type, video_mp4, poster) values ('X', 'url', 'http://x.example.com/a.mp4', '{"path":"images/x.webp","alt":"X"}')$$, 'HM-2    plain http video URL rejected', '23514');
select tests.throws($$update public.site_settings set socials = '{"github":"javascript:alert(1)"}'$$, 'URL     non-https social link rejected', '23514');
select tests.throws($$update public.site_settings set socials = '{"myspace":"https://myspace.com/x"}'$$, 'URL     unknown social network rejected', '23514');
select tests.throws($$update public.site_settings set public_email = 'not-an-email'$$, 'EMAIL   invalid public email rejected', '23514');
select tests.throws($$update public.projects set globe = '{"lat":120,"lng":0}' where slug = 'proj-p'$$, 'GLOBE   latitude out of range rejected', '23514');
select tests.throws($$insert into public.skills (name, category) values ('SKILL P', 'X')$$, 'SKILL   duplicate skill name (any case) rejected', '23505');
select tests.throws($$update public.site_settings set seo = jsonb_build_object('title', repeat('x', 71))$$, 'SEO     SEO title over 70 chars rejected', '23514');

-- AC-1.9 cascade
insert into public.custom_sections (id, name, slug, fields) values
  ('93000000-0000-4000-8000-000000000001', 'Doomed', 'doomed', '[{"key":"a","label":"A","type":"text","required":true}]');
insert into public.custom_items (section_id, data) values
  ('93000000-0000-4000-8000-000000000001', '{"a":"1"}'), ('93000000-0000-4000-8000-000000000001', '{"a":"2"}');
delete from public.custom_sections where id = '93000000-0000-4000-8000-000000000001';
select tests.eq(tests.count($$select 1 from public.custom_items where section_id = '93000000-0000-4000-8000-000000000001'$$), 0::bigint,
  'AC-1.9  deleting a section deletes its items');

-- AC-1.10 updated_at
insert into public.achievements (id, title, created_at, updated_at) values
  ('c0000000-0000-4000-8000-000000000099', 'Old', '2000-01-01', '2000-01-01');
update public.achievements set title = 'Renamed' where id = 'c0000000-0000-4000-8000-000000000099';
select tests.eq((select updated_at from public.achievements where id = 'c0000000-0000-4000-8000-000000000099'), now(),
  'AC-1.10 updated_at set on update');
update public.site_settings set tagline = 'Changed' where id = 1;
select tests.eq((select updated_at from public.site_settings where id = 1), now(), 'AC-1.10 updated_at set on site_settings update');

-- ===========================================================================
-- Anonymous visitor  AC-1.12 – AC-1.15, AC-1.18, AC-1.20
-- ===========================================================================
select tests.login_anon();

select tests.eq(public.is_owner(), false, 'AUTH    anon is not the owner');
select tests.eq(tests.count('select 1 from public.site_settings'), 1::bigint, 'AC-1.12 anon reads site_settings');

do $$
declare
  r record;
begin
  for r in select * from content_tables loop
    perform tests.ok(
      tests.count(format('select 1 from public.%I where not is_published', r.t)) = 0,
      format('AC-1.12 anon cannot read unpublished %s', r.t));
    perform tests.ok(
      tests.count(format('select 1 from public.%I where id = %L', r.t, r.published_id)) = 1,
      format('AC-1.12 anon reads published %s', r.t));
    perform tests.throws(r.insert_sql, format('AC-1.14 anon cannot insert into %s', r.t), '42501');
    perform tests.throws(format('update public.%I set sort_order = 99 where id = %L', r.t, r.published_id),
      format('AC-1.14 anon cannot update %s', r.t), '42501');
    perform tests.throws(format('delete from public.%I where id = %L', r.t, r.published_id),
      format('AC-1.14 anon cannot delete from %s', r.t), '42501');
  end loop;
end $$;

select tests.eq(tests.count($$select 1 from public.custom_items where id = '91000000-0000-4000-8000-000000000003'$$), 0::bigint,
  'AC-1.13 anon cannot read a published item in an unpublished section');
select tests.throws($$update public.site_settings set tagline = 'hacked'$$, 'AC-1.14 anon cannot update site_settings', '42501');
select tests.throws($$select * from public.app_owner$$, 'AUTH    anon cannot read app_owner', '42501');

-- messages
select tests.lives($$insert into public.messages (name, email, kind, subject, body, budget) values ('Visitor', 'v@example.com', 'freelance', 'Hello', 'I would like to hire you for a project.', '50k INR')$$,
  'AC-1.15 anon can send a valid message');
select tests.throws($$insert into public.messages (name, email, body, status) values ('V', 'v@example.com', 'Setting my own status here', 'read')$$,
  'AC-1.15 anon cannot set message status', '42501');
select tests.throws($$insert into public.messages (name, email, body, created_at) values ('V', 'v@example.com', 'Backdating my message', '2000-01-01')$$,
  'AC-1.15 anon cannot set created_at', '42501');
select tests.throws($$insert into public.messages (id, name, email, body) values ('92000000-0000-4000-8000-0000000000ff', 'V', 'v@example.com', 'Choosing my own id here')$$,
  'AC-1.15 anon cannot choose the message id', '42501');
select tests.throws($$insert into public.messages (name, email, body) values ('V', 'bad-email', 'A valid length body')$$,
  'AC-1.15 anon message with invalid email rejected', '23514');
select tests.throws($$select * from public.messages$$, 'AC-1.15 anon cannot read messages', '42501');
select tests.throws($$update public.messages set status = 'read'$$, 'AC-1.15 anon cannot update messages', '42501');
select tests.throws($$delete from public.messages$$, 'AC-1.15 anon cannot delete messages', '42501');

-- storage
select tests.throws($$insert into storage.objects (bucket_id, name) values ('images', 'projects/evil.png')$$, 'AC-1.18 anon cannot upload images', '42501');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('documents', 'resume.pdf')$$, 'AC-1.18 anon cannot upload documents', '42501');

-- reorder
select tests.throws($$select public.reorder('projects', array['b0000000-0000-4000-8000-000000000001']::uuid[])$$, 'AC-1.20 anon cannot call reorder', '42501');

reset role;

-- ===========================================================================
-- Signed-in stranger (not the owner)  AC-1.16, AC-1.18, AC-1.20
-- ===========================================================================
select tests.login('22222222-2222-4222-8222-222222222222');

select tests.eq(public.is_owner(), false, 'AUTH    stranger is not the owner');

do $$
declare
  r record;
begin
  for r in select * from content_tables loop
    perform tests.ok(
      tests.count(format('select 1 from public.%I where not is_published', r.t)) = 0,
      format('AC-1.16 stranger cannot read unpublished %s', r.t));
    perform tests.throws(r.insert_sql, format('AC-1.16 stranger cannot insert into %s', r.t), '42501');
    perform tests.eq(tests.rows(format('update public.%I set sort_order = 99 where id = %L', r.t, r.published_id)), 0::bigint,
      format('AC-1.16 stranger updates 0 rows in %s', r.t));
    perform tests.eq(tests.rows(format('delete from public.%I where id = %L', r.t, r.published_id)), 0::bigint,
      format('AC-1.16 stranger deletes 0 rows in %s', r.t));
  end loop;
end $$;

select tests.eq(tests.count($$select 1 from public.custom_items where id = '91000000-0000-4000-8000-000000000003'$$), 0::bigint,
  'AC-1.16 stranger cannot read a published item in an unpublished section');
select tests.eq(tests.rows($$update public.site_settings set tagline = 'hacked'$$), 0::bigint, 'AC-1.16 stranger updates 0 rows in site_settings');
select tests.throws($$select * from public.app_owner$$, 'AUTH    stranger cannot read app_owner', '42501');

select tests.lives($$insert into public.messages (name, email, body) values ('Stranger', 's@example.com', 'Signed-in visitors can also write.')$$,
  'AC-1.16 stranger can send a message');
select tests.throws($$insert into public.messages (name, email, body, status) values ('S', 's@example.com', 'Setting my own status here', 'archived')$$,
  'AC-1.16 stranger cannot set message status', '42501');
select tests.eq(tests.count($$select 1 from public.messages$$), 0::bigint, 'AC-1.16 stranger reads 0 messages');
select tests.eq(tests.rows($$update public.messages set status = 'read'$$), 0::bigint, 'AC-1.16 stranger updates 0 messages');
select tests.eq(tests.rows($$delete from public.messages$$), 0::bigint, 'AC-1.16 stranger deletes 0 messages');

select tests.throws($$insert into storage.objects (bucket_id, name) values ('images', 'projects/evil.png')$$, 'AC-1.18 stranger cannot upload', '42501');
select tests.throws($$select public.reorder('projects', array['b0000000-0000-4000-8000-000000000001']::uuid[])$$, 'AC-1.20 stranger cannot reorder', '42501');

reset role;

-- data the stranger tried to change is untouched
select tests.eq((select tagline from public.site_settings where id = 1), 'Changed', 'AC-1.16 site_settings unchanged after stranger attempt');
select tests.eq((select count(*) from public.messages where status = 'new'), 3::bigint, 'AC-1.16 messages unchanged after stranger attempt');
select tests.eq((select sort_order from public.projects where id = 'b0000000-0000-4000-8000-000000000001'), 0, 'AC-1.16 project unchanged after stranger attempt');

-- ===========================================================================
-- Owner WITHOUT the authenticator code (password only, aal1)  AC-2.4 / spec 02 AD-3
-- ===========================================================================
select tests.login('11111111-1111-4111-8111-111111111111', 'aal1');

select tests.eq(public.is_owner(), false, 'AC-2.4  password-only owner session is not treated as owner');
select tests.eq(public.is_owner_account(), true, 'AC-2.4  is_owner_account() still recognises the account');
select tests.ok(tests.count('select 1 from public.projects where not is_published') = 0, 'AC-2.4  password-only owner cannot read drafts');
select tests.throws($$insert into public.projects (slug, title, summary) values ('aal1-proj', 'X', 'X')$$, 'AC-2.4  password-only owner cannot insert', '42501');
select tests.eq(tests.rows($$update public.site_settings set tagline = 'aal1 edit'$$), 0::bigint, 'AC-2.4  password-only owner updates 0 settings rows');
select tests.eq(tests.count($$select 1 from public.messages$$), 0::bigint, 'AC-2.4  password-only owner reads 0 messages');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('images', 'aal1/x.png')$$, 'AC-2.4  password-only owner cannot upload', '42501');
select tests.throws($$select public.reorder('projects', array['b0000000-0000-4000-8000-000000000001']::uuid[])$$, 'AC-2.4  password-only owner cannot reorder', '42501');

reset role;

select tests.login('22222222-2222-4222-8222-222222222222', 'aal2');
select tests.eq(public.is_owner_account(), false, 'AC-2.5  is_owner_account() is false for other accounts');
select tests.eq(public.is_owner(), false, 'AC-2.5  another account with two-factor is still not the owner');
reset role;

select tests.login_anon();
select tests.throws($$select public.is_owner_account()$$, 'AC-2.5  anon cannot call is_owner_account()', '42501');
reset role;

-- ===========================================================================
-- Owner  AC-1.11, AC-1.17, AC-1.18
-- ===========================================================================
select tests.login('11111111-1111-4111-8111-111111111111');

select tests.eq(public.is_owner(), true, 'AUTH    owner is recognised');

do $$
declare
  r record;
begin
  for r in select * from content_tables loop
    perform tests.ok(
      tests.count(format('select 1 from public.%I where not is_published', r.t)) >= 1,
      format('AC-1.17 owner reads unpublished %s', r.t));
    perform tests.lives(r.insert_sql, format('AC-1.17 owner can insert into %s', r.t));
    perform tests.eq(tests.rows(format('update public.%I set sort_order = 5 where id = %L', r.t, r.published_id)), 1::bigint,
      format('AC-1.17 owner can update %s', r.t));
  end loop;
end $$;

select tests.eq(tests.rows($$update public.site_settings set tagline = 'Owner edit'$$), 1::bigint, 'AC-1.17 owner can update site_settings');
select tests.throws($$insert into public.site_settings (id) values (1)$$, 'AC-1.17 owner cannot insert a second settings row', '42501');
select tests.throws($$delete from public.site_settings$$, 'AC-1.17 owner cannot delete the settings row', '42501');
select tests.ok(tests.count($$select 1 from public.messages$$) >= 3, 'AC-1.17 owner can read messages');
select tests.eq(tests.rows($$update public.messages set status = 'read' where id = '92000000-0000-4000-8000-000000000001'$$), 1::bigint, 'AC-1.17 owner can update message status');
select tests.throws($$update public.messages set body = 'rewritten body text' where id = '92000000-0000-4000-8000-000000000001'$$, 'AC-1.17 owner cannot rewrite a message body', '42501');
select tests.eq(tests.rows($$delete from public.messages where id = '92000000-0000-4000-8000-000000000001'$$), 1::bigint, 'AC-1.17 owner can delete messages');
select tests.throws($$select * from public.app_owner$$, 'AUTH    even the owner cannot read app_owner through the API', '42501');

-- deletes for every content table (after the updates above)
do $$
declare
  r record;
begin
  for r in select * from content_tables where t <> 'custom_sections' loop
    perform tests.eq(tests.rows(format('delete from public.%I where id = %L', r.t, r.published_id)), 1::bigint,
      format('AC-1.17 owner can delete from %s', r.t));
  end loop;
end $$;
select tests.eq(tests.rows($$delete from public.custom_sections where id = '90000000-0000-4000-8000-000000000002'$$), 1::bigint,
  'AC-1.17 owner can delete from custom_sections');

-- reorder
select tests.lives($$select public.reorder('skills', array['e0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000501']::uuid[])$$,
  'AC-1.11 owner can reorder');
select tests.eq((select sort_order from public.skills where id = 'e0000000-0000-4000-8000-000000000002'), 0, 'AC-1.11 first id gets sort_order 0');
select tests.eq((select sort_order from public.skills where id = '00000000-0000-4000-8000-000000000501'), 1, 'AC-1.11 second id gets sort_order 1');
select tests.throws($$select public.reorder('app_owner', array['11111111-1111-4111-8111-111111111111']::uuid[])$$, 'AC-1.11 reorder rejects tables outside the whitelist', '22023');
select tests.throws($$select public.reorder('projects; drop table public.projects', '{}'::uuid[])$$, 'AC-1.11 reorder rejects injection attempts', '22023');
select tests.throws($$select public.reorder('skills', array['e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002']::uuid[])$$, 'AC-1.11 reorder rejects duplicate ids', '22023');

-- storage
select tests.lives($$insert into storage.objects (bucket_id, name) values ('images', 'projects/cover.webp')$$, 'AC-1.18 owner can upload images');
select tests.lives($$insert into storage.objects (bucket_id, name) values ('videos', 'hero/reel.mp4')$$, 'AC-1.18 owner can upload videos');
select tests.lives($$insert into storage.objects (bucket_id, name) values ('documents', 'resume.pdf')$$, 'AC-1.18 owner can upload documents');
select tests.eq(tests.rows($$update storage.objects set metadata = '{}' where bucket_id = 'images'$$), 1::bigint, 'AC-1.18 owner can replace files');
select tests.eq(tests.rows($$delete from storage.objects where bucket_id = 'documents'$$), 1::bigint, 'AC-1.18 owner can delete files');

reset role;

-- ===========================================================================
-- Bucket limits  AC-1.19 (enforced by Supabase Storage from these settings; re-checked live in task 1.14)
-- ===========================================================================
select tests.eq((select file_size_limit from storage.buckets where id = 'images'), 5242880::bigint, 'AC-1.19 images bucket limited to 5 MB');
select tests.eq((select file_size_limit from storage.buckets where id = 'videos'), 15728640::bigint, 'AC-1.19 videos bucket limited to 15 MB');
select tests.eq((select file_size_limit from storage.buckets where id = 'documents'), 5242880::bigint, 'AC-1.19 documents bucket limited to 5 MB');
select tests.eq((select allowed_mime_types from storage.buckets where id = 'documents'), array['application/pdf'], 'AC-1.19 documents bucket accepts PDF only');
select tests.eq((select allowed_mime_types from storage.buckets where id = 'videos'), array['video/mp4', 'video/webm'], 'AC-1.19 videos bucket accepts MP4/WebM only');
select tests.ok((select not ('image/gif' = any (allowed_mime_types)) from storage.buckets where id = 'images'), 'AC-1.19 images bucket rejects other image types');
select tests.ok((select bool_and(public) from storage.buckets where id in ('images', 'videos', 'documents')), 'AC-1.19 buckets are public-read');

-- ===========================================================================
-- Contact-form protection (Part 7)
-- ===========================================================================
\ir contact.test.sql

-- ===========================================================================
-- Shop (Part 8)
-- ===========================================================================
\ir shop.test.sql


-- ===========================================================================
\o
\pset tuples_only on
\pset format unaligned
select format(E'\n✔ All %s checks passed.', current_setting('tests.passed'));

rollback;
