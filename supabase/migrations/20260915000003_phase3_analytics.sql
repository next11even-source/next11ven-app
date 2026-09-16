-- Phase 3 analytics: weekly_active_snapshots table + application outcomes RPC
-- + cohort retention RPC.
--
-- weekly_active_snapshots
-- -----------------------
-- Seeded weekly by /api/cron/weekly-snapshot (Monday 07:00 UTC, runs before the
-- 08:00 metrics report). Each row records that a user was active (last_sign_in_at
-- fell inside that calendar week) during that ISO week.
--
-- CRITICAL: the snapshot cron uses fixed ISO week boundaries, NOT now()-7days.
-- Using a rolling window would make a late-firing cron capture a different set
-- of users than an on-time one (users who logged in right at the boundary would
-- either be included or excluded based on execution time). The fixed boundary
-- means the same user either logged in during that calendar week or they didn't
-- — cron timing cannot shift which week they land in.
--
-- NO BACKFILL IS POSSIBLE. last_sign_in_at is current-state only — it overwrites
-- on every login. History before the first cron run is permanently lost.
-- Every week the cron doesn't run is a permanent gap in the heatmap.
-- Monitor the cron; missing weeks cannot be recovered.
--
-- analytics_application_outcomes()
-- ---------------------------------
-- Monthly counts of accepted / rejected / closed-without-coach-decision
-- applications. Event-style: each outcome is dated to when it occurred
-- (updated_at for accept/reject, closed_at for closed), not when the
-- application was submitted. Confirmed zero overlap between accepted and
-- closed_at as of 15 Sep 2026; defensive filter kept anyway.
--
-- analytics_cohort_retention()
-- ----------------------------
-- Reads weekly_active_snapshots to build a cohort-retention grid.
-- Rows = signup cohort-week (calendar Mon–Sun, players+coaches only;
-- admin excluded to prevent high-frequency founder logins skewing tiny
-- early cohorts). Columns = week offset since signup (W0, W1, …).
-- Values = % of cohort with a snapshot in that week.
-- Empty weeks (cron not yet run for that offset) are absent from the
-- retention object; the UI renders them as "no data" cells.

-- ─── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.weekly_active_snapshots (
  week_start  date not null,   -- Monday of the ISO week (UTC)
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null,   -- mirrors profiles.role at snapshot time
  primary key (week_start, user_id)
);

-- No RLS policies: all reads go through security-definer RPCs.
-- Service role bypasses RLS. Direct client access is denied by default.
alter table public.weekly_active_snapshots enable row level security;

-- Index for the retention query (lookup by user_id to join with cohort_users)
create index if not exists weekly_active_snapshots_user_id_idx
  on public.weekly_active_snapshots (user_id);

grant select, insert on public.weekly_active_snapshots to service_role;

-- ─── analytics_application_outcomes() ────────────────────────────────────────

create or replace function analytics_application_outcomes()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce((
    with events as (
      -- Accepted: event date = when coach set status = 'accepted' (updated_at)
      select date_trunc('month', updated_at)::timestamptz as month, 'accepted' as outcome
      from applications where status = 'accepted'
      union all
      -- Rejected: event date = when coach set status = 'rejected' (updated_at)
      select date_trunc('month', updated_at)::timestamptz, 'rejected'
      from applications where status = 'rejected'
      union all
      -- Closed without a coach decision: event date = closed_at.
      -- Defensive NOT IN even though confirmed zero accepted/rejected rows
      -- also have closed_at set as of 15 Sep 2026 — keeps correct if
      -- application lifecycle logic ever changes.
      select date_trunc('month', closed_at)::timestamptz, 'closed'
      from applications
      where closed_at is not null
        and status not in ('accepted', 'rejected')
    )
    select jsonb_agg(
      jsonb_build_object(
        'label',    to_char(month, 'Mon YY'),
        'accepted', accepted,
        'rejected', rejected,
        'closed',   closed
      ) order by month
    )
    from (
      select
        month,
        count(*) filter (where outcome = 'accepted')::int as accepted,
        count(*) filter (where outcome = 'rejected')::int as rejected,
        count(*) filter (where outcome = 'closed')::int   as closed
      from events
      group by month
    ) monthly
  ), '[]'::jsonb);
end;
$$;

grant execute on function analytics_application_outcomes() to service_role;

-- ─── analytics_cohort_retention() ────────────────────────────────────────────

create or replace function analytics_cohort_retention()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce((
    with cohort_users as (
      -- Players and coaches only. Admin excluded deliberately: founder/admin
      -- accounts log in constantly and would skew percentage retention in
      -- early cohort weeks where total signups may be single digits.
      select
        p.id,
        date_trunc('week', p.created_at)::date as signup_week
      from profiles p
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach')
        and p.created_at >= '2026-04-01'  -- platform launch; no meaningful pre-launch cohorts
    ),
    cohort_sizes as (
      select signup_week, count(*)::int as cohort_size
      from cohort_users
      group by signup_week
    ),
    activity as (
      -- week_start and signup_week are both date; subtraction gives integer days.
      -- Dividing by 7 gives the ISO-week offset since signup (W0 = signup week).
      select
        cu.signup_week,
        ((was.week_start - cu.signup_week) / 7)::int as week_offset,
        count(distinct was.user_id)::int              as active_n
      from cohort_users cu
      join weekly_active_snapshots was
        on was.user_id = cu.id
       and was.week_start >= cu.signup_week
       and was.role in ('player', 'coach')
      group by cu.signup_week, week_offset
    )
    select jsonb_agg(
      jsonb_build_object(
        'signup_week',  cs.signup_week::text,
        'cohort_size',  cs.cohort_size,
        'retention',    coalesce((
          select jsonb_object_agg(
            a.week_offset::text,
            round(a.active_n * 100.0 / cs.cohort_size)::int
          )
          from activity a
          where a.signup_week = cs.signup_week
        ), '{}'::jsonb)
      ) order by cs.signup_week
    )
    from cohort_sizes cs
    where cs.cohort_size > 0
  ), '[]'::jsonb);
end;
$$;

grant execute on function analytics_cohort_retention() to service_role;
