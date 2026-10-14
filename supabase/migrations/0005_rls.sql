-- Part 1 · 0005 — Grants and Row Level Security (spec 01 §3.6)
--
-- Two layers, both fail closed:
--   1. Grants decide which operations a role may attempt at all.
--   2. RLS policies decide which rows those operations may touch.
--
-- Roles: anon = any visitor, authenticated = any signed-in user (owner or not).
-- The owner is recognised only through public.is_owner().
--
-- Note: RLS is enabled but not FORCED. Forcing would also apply RLS to the table owner
-- (postgres), which would break the security-definer is_owner() check and setup step S6.
-- API roles never own these tables, so they are always subject to RLS.

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- Public content: readable by everyone (RLS limits to published rows)
grant select on
  public.site_settings,
  public.hero_media,
  public.projects,
  public.achievements,
  public.experience,
  public.skills,
  public.testimonials,
  public.custom_sections,
  public.custom_items
to anon, authenticated;

-- Content writes: only signed-in users may attempt them (RLS limits to the owner)
grant insert, update, delete on
  public.hero_media,
  public.projects,
  public.achievements,
  public.experience,
  public.skills,
  public.testimonials,
  public.custom_sections,
  public.custom_items
to authenticated;

-- site_settings is a single row: update only, never insert or delete through the API
grant update on public.site_settings to authenticated;

-- messages: anyone may send, but only these columns (status/created_at stay at defaults)
grant insert (name, email, kind, subject, body, budget) on public.messages to anon, authenticated;
grant select, delete on public.messages to authenticated;
grant update (status) on public.messages to authenticated;

-- app_owner: no API access at all (read only through is_owner())

-- (reorder() grants are in 0007_functions.sql, where the function is created)

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_owner       enable row level security;
alter table public.site_settings   enable row level security;
alter table public.hero_media      enable row level security;
alter table public.projects        enable row level security;
alter table public.achievements    enable row level security;
alter table public.experience      enable row level security;
alter table public.skills          enable row level security;
alter table public.testimonials    enable row level security;
alter table public.custom_sections enable row level security;
alter table public.custom_items    enable row level security;
alter table public.messages        enable row level security;

-- Standard content tables: public reads published rows, owner does everything
do $$
declare
  t text;
begin
  foreach t in array array[
    'hero_media', 'projects', 'achievements', 'experience',
    'skills', 'testimonials', 'custom_sections'
  ] loop
    execute format('drop policy if exists "public read published" on public.%I', t);
    execute format(
      'create policy "public read published" on public.%I for select to anon, authenticated using (is_published)',
      t
    );
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated '
      'using ((select public.is_owner())) with check ((select public.is_owner()))',
      t
    );
  end loop;
end $$;

-- custom_items: an item is public only if it AND its section are published
drop policy if exists "public read published" on public.custom_items;
create policy "public read published" on public.custom_items
  for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1 from public.custom_sections s
      where s.id = custom_items.section_id and s.is_published
    )
  );

drop policy if exists "owner full access" on public.custom_items;
create policy "owner full access" on public.custom_items
  for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- site_settings: always public; owner may update
drop policy if exists "public read" on public.site_settings;
create policy "public read" on public.site_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "owner update" on public.site_settings;
create policy "owner update" on public.site_settings
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- messages: anyone sends; only the owner reads, updates and deletes
drop policy if exists "anyone can send" on public.messages;
create policy "anyone can send" on public.messages
  for insert to anon, authenticated
  with check (status = 'new');

drop policy if exists "owner read" on public.messages;
create policy "owner read" on public.messages
  for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "owner update" on public.messages;
create policy "owner update" on public.messages
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "owner delete" on public.messages;
create policy "owner delete" on public.messages
  for delete to authenticated
  using ((select public.is_owner()));

-- app_owner: RLS on with no policies = no rows visible to API roles
