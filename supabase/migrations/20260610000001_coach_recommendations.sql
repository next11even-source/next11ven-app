-- Coach Recommendation Engine
-- 1. coach_search_history — logs every search/filter action a coach performs.
--    Feeds the cumulative "taste profile" used by getRecommendedPlayers.
-- 2. coach_recommendation_log — every player surfaced to a coach (email + in-app).
--    Enforces the 6-week email rotation rule and enables future analytics.

-- ─── coach_search_history ─────────────────────────────────────────────────────

create table if not exists coach_search_history (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  filters_used jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now()
);

create index if not exists idx_coach_search_history_coach
  on coach_search_history (coach_id, searched_at desc);

-- ─── coach_recommendation_log ─────────────────────────────────────────────────

-- surface uses a check constraint rather than a pg enum so future surfaces
-- (e.g. 'push') can be added without an enum migration.
create table if not exists coach_recommendation_log (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  recommended_at timestamptz not null default now(),
  surface text not null check (surface in ('email', 'in_app')),
  email_opened boolean not null default false,
  cta_clicked boolean not null default false
);

create index if not exists idx_coach_rec_log_coach
  on coach_recommendation_log (coach_id);
create index if not exists idx_coach_rec_log_player
  on coach_recommendation_log (player_id);
create index if not exists idx_coach_rec_log_recommended_at
  on coach_recommendation_log (recommended_at desc);
-- Covers the 6-week email exclusion query directly.
create index if not exists idx_coach_rec_log_email_rotation
  on coach_recommendation_log (coach_id, surface, recommended_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table coach_search_history enable row level security;
alter table coach_recommendation_log enable row level security;

-- Coaches write their own search history directly from the client (debounced),
-- and may only ever read their own rows. The role check stops player/fan
-- accounts from polluting the table even if they hit the insert path.
create policy "coach_inserts_own_search_history"
  on coach_search_history for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'coach'
    )
  );

create policy "coach_reads_own_search_history"
  on coach_search_history for select
  using (coach_id = auth.uid());

-- Recommendation log is written exclusively by the service role (cron + API).
-- Coaches can read their own rows only; no client-side writes.
create policy "coach_reads_own_recommendation_log"
  on coach_recommendation_log for select
  using (coach_id = auth.uid());
