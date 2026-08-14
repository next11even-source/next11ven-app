-- Extend analytics_tracker_stats() with a trend line for career_stats
-- ("stat upload") adoption, mirroring the existing daily_trend for match
-- logging. Both are currently unrendered on the admin analytics page —
-- daily_trend has existed since 20260706000002 with no chart consuming it.
-- Additive only — existing fields unchanged.
--
-- Filtered to source = 'self_reported': the one-time legacy_import backfill
-- (127 rows, week of 13 Jul) is historical seeding, not ongoing adoption,
-- and would otherwise spike the trend if a future bulk import ever landed
-- inside the 14-day window.

create or replace function analytics_tracker_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(

    'eligible_players', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'adopters_total', coalesce((
      select count(distinct player_id)::int from performance_matches
    ), 0),

    'adopters_7d', coalesce((
      select count(*)::int from (
        select player_id, min(created_at) as first_log
        from performance_matches
        group by player_id
      ) t
      where t.first_log >= now() - interval '7 days'
    ), 0),

    'matches_total', coalesce((select count(*)::int from performance_matches), 0),

    'matches_7d', coalesce((
      select count(*)::int from performance_matches
      where created_at >= now() - interval '7 days'
    ), 0),

    'repeat_loggers', coalesce((
      select count(*)::int from (
        select player_id from performance_matches
        group by player_id having count(*) >= 2
      ) t
    ), 0),

    'motm_logged', coalesce((
      select count(*)::int from performance_matches
      where tags @> array['man_of_the_match']
    ), 0),

    'daily_trend', coalesce((
      with days as (
        select generate_series(
          date_trunc('day', now() - interval '13 days'),
          date_trunc('day', now()),
          '1 day'
        )::date as day
      ),
      logs as (
        select date_trunc('day', created_at)::date as day, count(*)::int as n
        from performance_matches
        where created_at >= now() - interval '14 days'
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object('label', to_char(d.day, 'DD Mon'), 'value', coalesce(l.n, 0))
        order by d.day asc
      )
      from days d
      left join logs l on l.day = d.day
    ), '[]'::jsonb),

    'searchable_pool', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
        and actively_looking = true and performance_stats_public = true
    ), 0),

    'stats_public_count', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
        and performance_stats_public = true
    ), 0),

    'career_rows_total', coalesce((select count(*)::int from career_stats), 0),

    'career_players_total', coalesce((
      select count(distinct player_id)::int from career_stats
    ), 0),

    'career_rows_7d', coalesce((
      select count(*)::int from career_stats
      where created_at >= now() - interval '7 days'
    ), 0),

    -- New: unique players who added self-reported career history in the
    -- last 7 days — career_rows_7d counts rows, this counts people, same
    -- distinction adopters_7d already makes for match logging.
    'career_players_7d', coalesce((
      select count(distinct player_id)::int from career_stats
      where source = 'self_reported' and created_at >= now() - interval '7 days'
    ), 0),

    -- New: daily self-reported career_stats additions, last 14 days — the
    -- "stat upload" adoption trend to sit next to daily_trend (match logs).
    'career_daily_trend', coalesce((
      with days as (
        select generate_series(
          date_trunc('day', now() - interval '13 days'),
          date_trunc('day', now()),
          '1 day'
        )::date as day
      ),
      uploads as (
        select date_trunc('day', created_at)::date as day, count(*)::int as n
        from career_stats
        where source = 'self_reported' and created_at >= now() - interval '14 days'
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object('label', to_char(d.day, 'DD Mon'), 'value', coalesce(u.n, 0))
        order by d.day asc
      )
      from days d
      left join uploads u on u.day = d.day
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function analytics_tracker_stats() from public, anon, authenticated;
grant execute on function analytics_tracker_stats() to service_role;
