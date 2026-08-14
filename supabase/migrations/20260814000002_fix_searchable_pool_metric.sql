-- searchable_pool has drifted from what it claims to measure. It was gated
-- on actively_looking = true, but /api/coach/performance-search (the actual
-- Coach Pro Dashboard query) dropped that gate a while back — see its own
-- comment: actively_looking is premium-only and opt-in, and gating on it
-- throttled the dashboard to ~21 players against ~134 who actually had
-- stats. The route's real eligibility is: role in (player, admin), approved,
-- performance_stats_public = true, and at least one row in performance_matches
-- or career_stats. This brings the metric back in line with that route so the
-- admin dashboard number matches what a coach actually sees.
-- Additive/corrective only — every other field unchanged.

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

    -- Fixed: mirrors /api/coach/performance-search's real eligibility —
    -- consented AND has actual data — not the stale actively_looking gate
    -- that route stopped using.
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
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function analytics_tracker_stats() from public, anon, authenticated;
grant execute on function analytics_tracker_stats() to service_role;
