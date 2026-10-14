-- Placeholder content (spec 01 §3.10).
-- Every row is UNPUBLISHED and marked "[Placeholder]", so nothing appears on the live site
-- until you edit and publish it from the admin. Safe to re-run (fixed ids, on conflict do nothing).

update public.site_settings
set
  display_name = 'Ausaf Hussain',
  tagline      = case when tagline = '' then 'Full-stack developer and filmmaker' else tagline end,
  bio_short    = case when bio_short = '' then '[Placeholder] A short introduction shown in the opening scene.' else bio_short end
where id = 1;

insert into public.hero_media (id, title, source_type, video_mp4, poster, sort_order)
values (
  '00000000-0000-4000-8000-000000000101',
  '[Placeholder] Drone reel',
  'upload',
  'videos/hero/placeholder.mp4',
  '{"path": "images/hero/placeholder.webp", "alt": "Aerial shot over hills at sunrise", "width": 1920, "height": 1080}',
  0
) on conflict (id) do nothing;

insert into public.projects (id, slug, title, summary, body, category, role, year, tech, links, is_featured, sort_order)
values (
  '00000000-0000-4000-8000-000000000201',
  'placeholder-project',
  '[Placeholder] Supply-chain data pipeline',
  'Replace this with a one-line summary of a real project.',
  'Write the full case study here in **Markdown**.',
  'work',
  'Backend developer',
  2026,
  array['C#', '.NET', 'Azure'],
  '{"repo": "https://github.com/iamausafhussain"}',
  true,
  0
) on conflict (id) do nothing;

insert into public.achievements (id, title, kind, issuer, awarded_on, description, sort_order)
values (
  '00000000-0000-4000-8000-000000000301',
  '[Placeholder] Certification or award',
  'certification',
  'Issuer name',
  '2026-01-01',
  'What it was for, in a sentence or two.',
  0
) on conflict (id) do nothing;

insert into public.experience (id, company, role, employment_type, location, start_date, description, highlights, tech, sort_order)
values (
  '00000000-0000-4000-8000-000000000401',
  '[Placeholder] Company',
  'Your role',
  'full_time',
  'City',
  '2023-01-01',
  'What you do there.',
  array['A highlight', 'Another highlight'],
  array['C#', '.NET'],
  0
) on conflict (id) do nothing;

insert into public.skills (id, name, category, level, sort_order)
values ('00000000-0000-4000-8000-000000000501', '[Placeholder] Skill', 'Backend', 4, 0)
on conflict (id) do nothing;

insert into public.testimonials (id, quote, author_name, author_role, author_company, rating, sort_order)
values (
  '00000000-0000-4000-8000-000000000601',
  '[Placeholder] A short quote from a client or colleague.',
  'Client name',
  'Role',
  'Company',
  5,
  0
) on conflict (id) do nothing;

insert into public.custom_sections (id, name, slug, intro, layout, fields, insert_after, sort_order)
values (
  '00000000-0000-4000-8000-000000000701',
  '[Placeholder] Talks',
  'talks',
  'Example of a section you define yourself. Delete it or make it your own.',
  'list',
  '[
    {"key": "title", "label": "Title", "type": "text", "required": true},
    {"key": "venue", "label": "Venue", "type": "text", "required": false, "help": "Where it happened"},
    {"key": "date", "label": "Date", "type": "date", "required": false},
    {"key": "format", "label": "Format", "type": "select", "required": true, "options": ["Talk", "Workshop", "Podcast"]},
    {"key": "link", "label": "Recording", "type": "url", "required": false}
  ]',
  'reviews',
  0
) on conflict (id) do nothing;

insert into public.custom_items (id, section_id, data, sort_order)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000701',
  '{"title": "[Placeholder] Talk title", "venue": "Meetup name", "date": "2026-01-01", "format": "Talk"}',
  0
) on conflict (id) do nothing;
