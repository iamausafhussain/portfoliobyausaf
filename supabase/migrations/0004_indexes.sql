-- Part 1 · 0004 — Indexes (spec 01 §3.4)
-- Unique indexes on projects.slug and custom_sections.slug come from their UNIQUE constraints.

-- The public site's main query: published rows in display order
create index if not exists hero_media_published_order      on public.hero_media      (is_published, sort_order);
create index if not exists projects_published_order        on public.projects        (is_published, sort_order);
create index if not exists achievements_published_order    on public.achievements    (is_published, sort_order);
create index if not exists experience_published_order      on public.experience      (is_published, sort_order);
create index if not exists skills_published_order          on public.skills          (is_published, sort_order);
create index if not exists testimonials_published_order    on public.testimonials    (is_published, sort_order);
create index if not exists custom_sections_published_order on public.custom_sections (is_published, sort_order);

create index if not exists custom_items_section_published_order
  on public.custom_items (section_id, is_published, sort_order);

-- Skill names are unique regardless of case ("React" = "react")
create unique index if not exists skills_name_unique_ci on public.skills (lower(name));

-- Admin inbox: newest first, filterable by status
create index if not exists messages_status_created on public.messages (status, created_at desc);

-- Foreign key lookups
create index if not exists testimonials_project_id on public.testimonials (project_id);
