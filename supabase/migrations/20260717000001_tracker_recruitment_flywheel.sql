-- Performance Tracker → Recruitment Flywheel: one coherent schema migration.
-- Covers every new column/table Stages 2–7 depend on, so table structure is
-- set once, not altered stage by stage.
--
-- Scope: STRUCTURAL schema only (tables, columns, RLS, indexes). The public
-- read path (SECURITY DEFINER aggregate fn) ships with Stage 2 as a
-- CREATE OR REPLACE — it encodes product logic, not table structure, and is
-- safely iterable.
--
-- Does NOT drop profiles.goals/assists/appearances/season: they keep
-- displaying until career_stats is populated (by a reviewed backfill script
-- with a dry-run/report mode) and the tracker-derived render is verified.
-- Guardrail — migrate before retire, no blank-profile window. A follow-up
-- migration retires the legacy columns after Stage 2 ships and the backfill
-- runs clean.

-- ── 1. Coarse public-visibility switch (Q1) ──────────────────────────────────
-- One switch, profile-level, default ON. Replaces the inert per-match
-- visible_on_profile (dropped below). Never per-match. Existing players seed to
-- true — Stage 2 ships with an in-app heads-up + prominent off-switch so nobody
-- is surprised their (objective-only) stats went public.
alter table profiles
  add column if not exists performance_stats_public boolean not null default true;

-- ── 2. Contract status — the one remaining static capture gap ─────────────────
-- Travel radius and midweek availability are deliberately NOT captured: a coach
-- who needs those just makes contact and asks. foot / height / date_of_birth /
-- city / location already exist and are not re-added. Contract status is the
-- single high-value non-league gettability signal that has no home today.
alter table profiles
  add column if not exists contract_status text
    check (contract_status is null
           or contract_status in ('non_contract','contracted','out_of_contract'));

-- ── 3. Discipline at match level (Stage 4) ────────────────────────────────────
-- Optional "add more" fields on the log; the core log stays ~20s. A second
-- yellow and a straight red are both logged as they happened (no auto-derive).
alter table performance_matches
  add column if not exists yellow_cards smallint not null default 0
    check (yellow_cards >= 0 and yellow_cards <= 2),
  add column if not exists red_card boolean not null default false;

-- Retire the inert per-match visibility flag — replaced by the profile-level
-- coarse switch. Confirmed in discovery that nothing reads or writes it, and
-- per-match visibility has been explicitly rejected in favour of the coarse
-- switch, so there is no future that resurrects it.
alter table performance_matches
  drop column if exists visible_on_profile;

-- ── 4. career_stats — pre-platform history (Q3) ───────────────────────────────
-- One-time seed of the career a player had BEFORE joining NEXT11VEN, as
-- per-season / per-club summaries, flagged self-reported. The live log
-- (performance_matches) owns everything from joining onward. Anti-double-count
-- (a season is summary-sourced OR log-sourced) is enforced in the Stage 2 read
-- function, keyed on season_start_year — there is no DB constraint behind it,
-- so that function is the sole enforcement point and needs explicit overlap
-- test coverage.
--
-- Per-season only, by design: no season-less "career total" row — it would
-- break the anti-double-count keying and is a vanity number a coach cannot
-- recruit on. Players with a long career enter the recent seasons that matter
-- and leave the rest to their bio prose.
--
-- updated_at: the app layer sets it explicitly on UPDATE (same convention as
-- performance_matches / club_stints / performance_targets — this codebase has
-- no BEFORE UPDATE triggers; default now() covers INSERT only). The Stage 5
-- career_stats route MUST pass updated_at on every update or it goes stale.
create table if not exists career_stats (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references profiles(id) on delete cascade,
  season_start_year smallint not null,                 -- e.g. 2024 = the 2024/25 season
  club_name         text,
  level             text,                               -- same values as lib/levels.ts LEVELS
  position          text,                               -- POSITIONS enum (Zod-validated at write, like performance_matches.position)
  apps              smallint check (apps is null or apps >= 0),
  goals             smallint check (goals is null or goals >= 0),
  assists           smallint check (assists is null or assists >= 0),
  minutes           integer  check (minutes is null or minutes >= 0),
  clean_sheets      smallint check (clean_sheets is null or clean_sheets >= 0),
  source            text not null default 'self_reported'
                    check (source in ('self_reported','legacy_import')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists career_stats_player_idx
  on career_stats (player_id, season_start_year desc);

-- Soft dedupe: one row per player/season/club. Multi-club seasons (loans) stay
-- allowed because club_name differs; coalesce keeps null-club rows unique too.
create unique index if not exists career_stats_unique_idx
  on career_stats (player_id, season_start_year, coalesce(club_name, ''));

alter table career_stats enable row level security;

drop policy if exists "career_stats_select" on career_stats;
drop policy if exists "career_stats_insert" on career_stats;
drop policy if exists "career_stats_update" on career_stats;
drop policy if exists "career_stats_delete" on career_stats;

-- Owner-only, same as performance_matches. Public exposure happens ONLY through
-- the Stage 2 SECURITY DEFINER aggregate fn (field-allowlisted) — never a
-- direct table read.
create policy "career_stats_select" on career_stats
  for select to authenticated using (player_id = auth.uid());
create policy "career_stats_insert" on career_stats
  for insert to authenticated with check (player_id = auth.uid());
create policy "career_stats_update" on career_stats
  for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy "career_stats_delete" on career_stats
  for delete to authenticated using (player_id = auth.uid());
