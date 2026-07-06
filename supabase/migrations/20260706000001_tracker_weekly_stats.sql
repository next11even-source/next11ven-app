-- Game Performance Tracker adoption metrics for the weekly Telegram report.
-- Called by the weekly-metrics cron (service role); merged into the snapshot
-- payload so deltas work automatically.

create or replace function tracker_weekly_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tracker_players_total', (select count(distinct player_id) from performance_matches),
    'tracker_matches_total', (select count(*) from performance_matches),
    'tracker_matches_7d', (select count(*) from performance_matches where created_at >= now() - interval '7 days'),
    'tracker_new_players_7d', (
      select count(*) from (
        select player_id, min(created_at) as first_log
        from performance_matches
        group by player_id
      ) t
      where t.first_log >= now() - interval '7 days'
    )
  );
$$;

-- Aggregates only, but no reason for players to be able to call it
revoke execute on function tracker_weekly_stats() from public, anon, authenticated;
grant execute on function tracker_weekly_stats() to service_role;
