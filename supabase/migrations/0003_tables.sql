-- Part 1 · 0003 — Tables, constraints and updated_at triggers (spec 01 §3.3)
-- Optional text is stored as '' (not null) unless the spec marks the column nullable.

-- ---------------------------------------------------------------------------
-- site_settings (exactly one row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  id                 smallint primary key default 1 check (id = 1),
  display_name       text not null default 'Ausaf Hussain' check (char_length(btrim(display_name)) between 1 and 80),
  tagline            text not null default '' check (char_length(tagline) <= 160),
  bio_short          text not null default '' check (char_length(bio_short) <= 300),
  bio_long           text not null default '' check (char_length(bio_long) <= 5000),
  portrait           jsonb check (public.is_image_ref(portrait)),
  location           text not null default '' check (char_length(location) <= 80),
  public_email       text check (public_email is null or public.is_email(public_email)),
  resume_path        text check (resume_path is null or public.is_storage_path(resume_path) or public.is_https_url(resume_path)),
  socials            jsonb not null default '{}'
                       check (public.is_url_map(socials, array['github', 'linkedin', 'youtube', 'instagram', 'x'])),
  available_for_work boolean not null default true,
  hero_playback      public.hero_playback not null default 'single',
  seo                jsonb not null default '{}' check (public.is_seo(seo)),
  updated_at         timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- hero_media (master spec §11.1)
-- ---------------------------------------------------------------------------
create table if not exists public.hero_media (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 100),
  source_type  public.hero_source not null,
  video_mp4    text not null,
  video_webm   text,
  video_mobile text,
  poster       jsonb not null check (jsonb_typeof(poster) = 'object' and public.is_image_ref(poster)),
  theme        public.theme_scope not null default 'both',
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- uploads point into the videos bucket; external sources must be https URLs
  constraint hero_media_sources_match_type check (
    case source_type
      when 'upload' then public.is_storage_path(video_mp4)
        and (video_webm is null or public.is_storage_path(video_webm))
        and (video_mobile is null or public.is_storage_path(video_mobile))
      when 'url' then public.is_https_url(video_mp4)
        and (video_webm is null or public.is_https_url(video_webm))
        and (video_mobile is null or public.is_https_url(video_mobile))
    end
  )
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (public.is_slug(slug)),
  title        text not null check (char_length(btrim(title)) between 1 and 100),
  summary      text not null check (char_length(btrim(summary)) between 1 and 280),
  body         text not null default '' check (char_length(body) <= 20000),
  category     public.project_category not null default 'work',
  role         text not null default '' check (char_length(role) <= 100),
  client       text check (client is null or char_length(client) <= 100),
  year         smallint check (year is null or year between 2000 and 2100),
  cover        jsonb check (public.is_image_ref(cover)),
  gallery      jsonb not null default '[]' check (public.is_image_ref_array(gallery, 20)),
  tech         text[] not null default '{}' check (public.is_text_list(tech, 20, 40)),
  links        jsonb not null default '{}'
                 check (public.is_url_map(links, array['live', 'repo', 'case_study', 'video'])),
  is_featured  boolean not null default false,
  globe        jsonb check (public.is_globe_position(globe)),
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- achievements
-- ---------------------------------------------------------------------------
create table if not exists public.achievements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 1 and 150),
  kind           public.achievement_kind not null default 'other',
  issuer         text check (issuer is null or char_length(issuer) <= 120),
  awarded_on     date,
  description    text not null default '' check (char_length(description) <= 1000),
  image          jsonb check (public.is_image_ref(image)),
  link           text check (link is null or public.is_https_url(link)),
  is_highlighted boolean not null default false,
  sort_order     int not null default 0,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- experience
-- ---------------------------------------------------------------------------
create table if not exists public.experience (
  id              uuid primary key default gen_random_uuid(),
  company         text not null check (char_length(btrim(company)) between 1 and 120),
  role            text not null check (char_length(btrim(role)) between 1 and 120),
  employment_type public.employment_type not null default 'full_time',
  location        text not null default '' check (char_length(location) <= 80),
  start_date      date not null,
  end_date        date,
  description     text not null default '' check (char_length(description) <= 2000),
  highlights      text[] not null default '{}' check (public.is_text_list(highlights, 10, 200)),
  tech            text[] not null default '{}' check (public.is_text_list(tech, 20, 40)),
  logo            jsonb check (public.is_image_ref(logo)),
  sort_order      int not null default 0,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint experience_dates_ordered check (end_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- skills
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  category     text not null check (char_length(btrim(category)) between 1 and 40),
  level        smallint check (level is null or level between 1 and 5),
  icon         text check (icon is null or char_length(icon) <= 500),
  is_featured  boolean not null default false,
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- testimonials
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id             uuid primary key default gen_random_uuid(),
  quote          text not null check (char_length(btrim(quote)) between 1 and 600),
  author_name    text not null check (char_length(btrim(author_name)) between 1 and 80),
  author_role    text not null default '' check (char_length(author_role) <= 80),
  author_company text not null default '' check (char_length(author_company) <= 80),
  avatar         jsonb check (public.is_image_ref(avatar)),
  rating         smallint check (rating is null or rating between 1 and 5),
  source_url     text check (source_url is null or public.is_https_url(source_url)),
  project_id     uuid references public.projects (id) on delete set null,
  sort_order     int not null default 0,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- custom_sections + custom_items (admin-defined sections)
-- ---------------------------------------------------------------------------
create table if not exists public.custom_sections (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  slug         text not null unique
                 check (public.is_slug(slug) and slug not in ('admin', 'projects', 'resume', 's')),
  intro        text not null default '' check (char_length(intro) <= 500),
  layout       public.section_layout not null default 'grid',
  fields       jsonb not null check (public.is_valid_field_defs(fields)),
  insert_after public.chapter_key not null default 'reviews',
  show_on_home boolean not null default true,
  has_page     boolean not null default false,
  show_in_nav  boolean not null default false,
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- the contact chapter is always last
  constraint custom_sections_not_after_contact check (insert_after <> 'contact')
);

create table if not exists public.custom_items (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.custom_sections (id) on delete cascade,
  data         jsonb not null default '{}'
                 check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 51200),
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- messages (contact form)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  email      text not null check (public.is_email(email)),
  kind       public.message_kind not null default 'general',
  subject    text not null default '' check (char_length(subject) <= 150),
  body       text not null check (char_length(btrim(body)) between 10 and 5000),
  budget     text check (budget is null or char_length(budget) <= 60),
  status     public.message_status not null default 'new',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'site_settings', 'hero_media', 'projects', 'achievements', 'experience',
    'skills', 'testimonials', 'custom_sections', 'custom_items'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;
