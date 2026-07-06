-- Game Performance Tracker: club_stints + performance_matches + performance_targets
--
-- All data is private to the player (owner-only RLS). visible_on_profile is
-- reserved for a future coach-facing feature — nothing reads it yet.
-- Premium gating is enforced in the API layer; RLS here is the privacy backstop.

-- ── Club stints ───────────────────────────────────────────────────────────────
-- Match entries attach to a stint, never to profiles.club, so career totals
-- survive club moves. end_date null = ongoing. Trials get their own type so a
-- trial run can be isolated from a club's competitive stat line.

create table if not exists club_stints (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references profiles(id) on delete cascade,
  club_name   text not null,
  level       text,                                   -- same values as lib/levels.ts LEVELS, optional
  stint_type  text not null default 'contracted'
              check (stint_type in ('contracted', 'trial', 'loan')),
  start_date  date not null,
  end_date    date check (end_date is null or end_date >= start_date),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists club_stints_player_idx on club_stints (player_id, start_date desc);

alter table club_stints enable row level security;

drop policy if exists "club_stints_select" on club_stints;
drop policy if exists "club_stints_insert" on club_stints;
drop policy if exists "club_stints_update" on club_stints;
drop policy if exists "club_stints_delete" on club_stints;

create policy "club_stints_select" on club_stints
  for select to authenticated
  using (player_id = auth.uid());

create policy "club_stints_insert" on club_stints
  for insert to authenticated
  with check (player_id = auth.uid());

create policy "club_stints_update" on club_stints
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create policy "club_stints_delete" on club_stints
  for delete to authenticated
  using (player_id = auth.uid());

-- ── Match entries ─────────────────────────────────────────────────────────────
-- stint_id is nullable: a player between clubs (or logging a kickabout) can
-- still track. competition_type drives what counts as "competitive" —
-- league + cup feed season totals/insights; pre_season/friendly/other are
-- logged and filterable but sit outside the headline numbers.

create table if not exists performance_matches (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null references profiles(id) on delete cascade,
  stint_id           uuid references club_stints(id) on delete set null,
  match_date         date not null,
  opponent           text not null,
  competition_type   text not null default 'league'
                     check (competition_type in ('league', 'cup', 'pre_season', 'friendly', 'other')),
  competition_name   text,                            -- optional, e.g. "FA Vase"
  goals_for          smallint check (goals_for is null or goals_for >= 0),
  goals_against      smallint check (goals_against is null or goals_against >= 0),
  started            boolean not null default true,   -- false = subbed on
  position           text,
  minutes_played     smallint check (minutes_played is null or (minutes_played >= 0 and minutes_played <= 120)),
  goals              smallint not null default 0 check (goals >= 0),
  assists            smallint not null default 0 check (assists >= 0),
  rating             numeric(3,1) check (rating is null or (rating >= 1 and rating <= 10 and (rating * 2) = floor(rating * 2))),
  notes              text,
  tags               text[] not null default '{}',    -- preset chips, filterable
  visible_on_profile boolean not null default false,  -- reserved for future coach-facing view; unread
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists performance_matches_player_date_idx
  on performance_matches (player_id, match_date desc);

create index if not exists performance_matches_stint_idx
  on performance_matches (stint_id);

create index if not exists performance_matches_tags_idx
  on performance_matches using gin (tags);

alter table performance_matches enable row level security;

drop policy if exists "performance_matches_select" on performance_matches;
drop policy if exists "performance_matches_insert" on performance_matches;
drop policy if exists "performance_matches_update" on performance_matches;
drop policy if exists "performance_matches_delete" on performance_matches;

create policy "performance_matches_select" on performance_matches
  for select to authenticated
  using (player_id = auth.uid());

-- Insert/update also verify the stint (when set) belongs to the same player,
-- so a match can never be attached to someone else's stint.
create policy "performance_matches_insert" on performance_matches
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and (stint_id is null or exists (
      select 1 from club_stints s where s.id = stint_id and s.player_id = auth.uid()
    ))
  );

create policy "performance_matches_update" on performance_matches
  for update to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and (stint_id is null or exists (
      select 1 from club_stints s where s.id = stint_id and s.player_id = auth.uid()
    ))
  );

create policy "performance_matches_delete" on performance_matches
  for delete to authenticated
  using (player_id = auth.uid());

-- ── Season targets (phase 4 feature — table created now to avoid a second
--    migration; one row per player per season) ─────────────────────────────────

create table if not exists performance_targets (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null references profiles(id) on delete cascade,
  season_start_year  smallint not null,                -- e.g. 2026 = the 2026/27 season (1 Jul–30 Jun)
  apps_target        smallint check (apps_target is null or apps_target > 0),
  goals_target       smallint check (goals_target is null or goals_target >= 0),
  assists_target     smallint check (assists_target is null or assists_target >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (player_id, season_start_year)
);

alter table performance_targets enable row level security;

drop policy if exists "performance_targets_select" on performance_targets;
drop policy if exists "performance_targets_insert" on performance_targets;
drop policy if exists "performance_targets_update" on performance_targets;
drop policy if exists "performance_targets_delete" on performance_targets;

create policy "performance_targets_select" on performance_targets
  for select to authenticated
  using (player_id = auth.uid());

create policy "performance_targets_insert" on performance_targets
  for insert to authenticated
  with check (player_id = auth.uid());

create policy "performance_targets_update" on performance_targets
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create policy "performance_targets_delete" on performance_targets
  for delete to authenticated
  using (player_id = auth.uid());
