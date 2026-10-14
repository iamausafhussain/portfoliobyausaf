-- Part 1 · 0006 — Storage buckets and policies (spec 01 §3.7)
--
-- All three buckets are public: files are served by URL to every visitor.
-- File type and size limits are enforced by Supabase Storage using the bucket settings below.
-- Only the owner can upload, replace or delete files.
-- Object names follow <entity>/<uuid>.<ext>, e.g. projects/2b1f….webp in the "images" bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('images',    'images',    true, 5242880,  array['image/webp', 'image/avif', 'image/jpeg', 'image/png', 'image/svg+xml']),
  ('videos',    'videos',    true, 15728640, array['video/mp4', 'video/webm']),
  ('documents', 'documents', true, 5242880,  array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve files without a SELECT policy. Listing bucket contents is owner-only,
-- and the owner needs SELECT for upserts and the admin media library.
drop policy if exists "portfolio media: owner read" on storage.objects;
create policy "portfolio media: owner read" on storage.objects
  for select to authenticated
  using (bucket_id in ('images', 'videos', 'documents') and (select public.is_owner()));

drop policy if exists "portfolio media: owner upload" on storage.objects;
create policy "portfolio media: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('images', 'videos', 'documents') and (select public.is_owner()));

drop policy if exists "portfolio media: owner update" on storage.objects;
create policy "portfolio media: owner update" on storage.objects
  for update to authenticated
  using (bucket_id in ('images', 'videos', 'documents') and (select public.is_owner()))
  with check (bucket_id in ('images', 'videos', 'documents') and (select public.is_owner()));

drop policy if exists "portfolio media: owner delete" on storage.objects;
create policy "portfolio media: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('images', 'videos', 'documents') and (select public.is_owner()));
