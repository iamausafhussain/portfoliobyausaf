-- Part 1 · 0001 — Enums (spec 01 §3.2)
-- gen_random_uuid() is built into Postgres 13+, so no extension is required.
-- Each type is created only if missing, so this file can be re-run safely.

do $$
begin
  create type public.project_category as enum ('work', 'freelance', 'personal');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.achievement_kind as enum ('award', 'certification', 'title', 'recognition', 'publication', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'freelance', 'internship');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.hero_source as enum ('upload', 'url');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.theme_scope as enum ('dark', 'light', 'both');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.hero_playback as enum ('single', 'sequence', 'random');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_kind as enum ('hire', 'freelance', 'collab', 'general');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_status as enum ('new', 'read', 'replied', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.section_layout as enum ('grid', 'list', 'timeline', 'carousel', 'gallery');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.chapter_key as enum ('hero', 'about', 'projects', 'credits', 'timeline', 'reviews', 'contact');
exception when duplicate_object then null;
end $$;
