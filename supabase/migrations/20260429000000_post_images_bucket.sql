-- Create post-images storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880,  -- 5MB
  array['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic']
)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "post_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Public read
create policy "post_images_select" on storage.objects
  for select to public
  using (bucket_id = 'post-images');

-- Users can delete their own uploads
create policy "post_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);
