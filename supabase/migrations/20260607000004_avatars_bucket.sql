-- Avatars storage bucket (public read, owner write)
-- upsert: true in the upload call requires both INSERT and UPDATE policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5MB, matches client-side validation
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- Public read — avatars are shown everywhere on the platform
create policy "avatars_select" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder (first upload)
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Authenticated users can replace their own avatar (upsert: true)
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own avatar
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
