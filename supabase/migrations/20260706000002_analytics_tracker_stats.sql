-- Game Performance Tracker adoption metrics for the admin analytics tab.
-- Same shape/pattern as analytics_platform_stats() / analytics_revenue_stats():
-- one jsonb-returning function, service-role only, called from
-- /api/admin/tracker-stats.

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

    -- Addressable pool: approved players/admins who could log a match.
    'eligible_players', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    -- Adoption: distinct players who have ever logged a match.
    'adopters_total', coalesce((
      select count(distinct player_id)::int from performance_matches
    ), 0),

    -- Growth: players whose FIRST logged match landed in the last 7 days.
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

    -- Habit, not curiosity: adopters who came back and logged a 2nd match.
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

    -- Daily logging activity, last 14 days (by when it was LOGGED, not the
    -- match date, since this tracks product usage rather than fixtures).
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
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function analytics_tracker_stats() from public, anon, authenticated;
grant execute on function analytics_tracker_stats() to service_role;
