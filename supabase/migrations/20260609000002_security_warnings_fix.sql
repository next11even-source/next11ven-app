-- Fix 1: player_views — replace always-true RLS policy with scoped policies
-- The old policy allowed all authenticated users to read all view records.
-- New policies: players see views of their own profile; viewers see their own activity;
-- inserts are locked to the authenticated user as the viewer (prevents spoofing).

drop policy if exists "Enable read access for all users" on player_views;
drop policy if exists "Enable insert for authenticated users only" on player_views;
drop policy if exists "Allow all" on player_views;

-- Players can see who viewed their profile; viewers can see their own history
create policy "player_views_select" on player_views
  for select to authenticated
  using (player_id = auth.uid() or viewer_id = auth.uid());

-- Any authenticated user can record a view, but only as themselves
create policy "player_views_insert" on player_views
  for insert to authenticated
  with check (viewer_id = auth.uid());

-- Views are immutable — no updates or deletes


-- Fix 2: avatars bucket — restrict SELECT to authenticated users only
-- The previous policy granted public (unauthenticated) SELECT, which allows
-- listing all files in the bucket. Since the whole platform requires login,
-- authenticated-only read is sufficient and closes the listing vector.

drop policy if exists "avatars_select" on storage.objects;

create policy "avatars_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');
