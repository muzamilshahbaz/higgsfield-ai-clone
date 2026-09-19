-- =====================================================================
-- 0004_storage.sql — buckets and object policies
--   uploads     private, one folder per user: uploads/<uid>/<file>
--   generations public read, written only by the service role
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 10485760,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('generations', 'generations', true, 104857600,
   array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------ uploads -------------------------------
-- A user may only touch objects inside their own uid-prefixed folder.
drop policy if exists uploads_insert_own on storage.objects;
create policy uploads_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists uploads_select_own on storage.objects;
create policy uploads_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists uploads_delete_own on storage.objects;
create policy uploads_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------- generations -----------------------------
-- Readable by anyone (the bucket is public); writes come from the
-- service-role client after a provider job completes, so no insert
-- policy is granted to end users.
drop policy if exists generations_read_all on storage.objects;
create policy generations_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'generations');
