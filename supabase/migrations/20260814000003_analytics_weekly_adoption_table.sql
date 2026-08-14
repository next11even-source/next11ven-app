-- Replaces the daily line-chart data with a weekly table shape, matching
-- the Month by Month table's format (one row per period, multiple metric
-- columns) — the requested read for comparing adoption week over week.
-- daily_trend / career_daily_trend stay as-is (additive, still valid if
-- ever needed elsewhere); this adds weekly_adoption alongside them.

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
      select count(*)::int from profiles p
      where p.approval_status = 'approved' and p.role in ('player', 'admin')
        and p.performance_stats_public = true
        and (
          exists (select 1 from performance_matches m where m.player_id = p.id)
          or exists (select 1 from career_stats c where c.player_id = p.id)
        )
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

    'career_players_7d', coalesce((
      select count(distinct player_id)::int from career_stats
      where source = 'self_reported' and created_at >= now() - interval '7 days'
    ), 0),

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
    ), '[]'::jsonb),

    -- Weekly, Month-by-Month-shaped table: one row per week (Mon-start, ISO),
    -- last 6 weeks. matches/loggers = match logging; history_rows/contributors
    -- = self-reported career_stats adds (legacy_import backfill excluded, same
    -- rule as career_daily_trend).
    'weekly_adoption', coalesce((
      with weeks as (
        select generate_series(
          date_trunc('week', now() - interval '5 weeks'),
          date_trunc('week', now()),
          '1 week'
        )::date as week_start
      ),
      matches_wk as (
        select date_trunc('week', created_at)::date as week_start,
               count(*)::int as n,
               count(distinct player_id)::int as loggers
        from performance_matches
        where created_at >= date_trunc('week', now() - interval '5 weeks')
        group by 1
      ),
      history_wk as (
        select date_trunc('week', created_at)::date as week_start,
               count(*)::int as n,
               count(distinct player_id)::int as contributors
        from career_stats
        where source = 'self_reported'
          and created_at >= date_trunc('week', now() - interval '5 weeks')
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object(
          'label', to_char(w.week_start, 'DD Mon'),
          'matches', coalesce(m.n, 0),
          'loggers', coalesce(m.loggers, 0),
          'history_rows', coalesce(h.n, 0),
          'contributors', coalesce(h.contributors, 0)
        ) order by w.week_start asc
      )
      from weeks w
      left join matches_wk m on m.week_start = w.week_start
      left join history_wk h on h.week_start = w.week_start
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function analytics_tracker_stats() from public, anon, authenticated;
grant execute on function analytics_tracker_stats() to service_role;
