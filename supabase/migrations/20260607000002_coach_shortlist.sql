-- coach_saved_players: table + RLS + extend notifications type constraint
--
-- Table likely already exists (created in Supabase dashboard).
-- IF NOT EXISTS makes this idempotent.

create table if not exists coach_saved_players (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  player_id   uuid not null references profiles(id) on delete cascade,
  folder_name text not null default 'Shortlist',
  created_at  timestamptz default now(),
  unique(coach_id, player_id)
);

-- RLS
alter table coach_saved_players enable row level security;

-- Drop existing policies (in case table was created with some via dashboard)
drop policy if exists "coach_saved_players_read"   on coach_saved_players;
drop policy if exists "coach_saved_players_delete"  on coach_saved_players;
drop policy if exists "coach_saved_players_update"  on coach_saved_players;

-- Coaches can read their own shortlist entries
create policy "coach_saved_players_read" on coach_saved_players
  for select to authenticated
  using (coach_id = auth.uid());

-- Coaches can delete their own shortlist entries
create policy "coach_saved_players_delete" on coach_saved_players
  for delete to authenticated
  using (coach_id = auth.uid());

-- Coaches can update their own entries (folder rename flow)
create policy "coach_saved_players_update" on coach_saved_players
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- No INSERT policy — the API route uses the service role key

-- ── Extend notifications type constraint ─────────────────────────────────────

alter table notifications drop constraint if exists notifications_type_check;

alter table notifications add constraint notifications_type_check check (type in (
  'post_like',
  'post_comment',
  'post_interest',
  'profile_view',
  'new_opportunity',
  'new_opportunity_application',
  'shortlist_post',
  'shortlist_availability',
  'shortlisted'
));
