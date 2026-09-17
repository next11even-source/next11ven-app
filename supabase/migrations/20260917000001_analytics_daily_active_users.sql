-- analytics_daily_active_users(p_window text)
-- Returns daily/weekly/monthly unique active user counts split by role.
-- "Active" = any of: sent a message, applied/received-application, viewed a player,
--   posted an opportunity, created/liked/commented a post, logged a match.
-- Approved users only. Zero-fill buckets via generate_series so the chart never has gaps.

create or replace function public.analytics_daily_active_users(
  p_window text default '7d'
)
returns table(bucket text, players int, coaches int)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_interval  interval;
  v_trunc     text;
  v_fmt       text;
  v_step      interval;
begin
  -- Resolve window parameters
  case p_window
    when '7d' then
      v_interval := interval '7 days';
      v_trunc    := 'day';
      v_fmt      := 'DD Mon';
      v_step     := interval '1 day';
    when '28d' then
      v_interval := interval '28 days';
      v_trunc    := 'day';
      v_fmt      := 'DD Mon';
      v_step     := interval '1 day';
    when '6m' then
      v_interval := interval '6 months';
      v_trunc    := 'week';
      v_fmt      := 'DD Mon';
      v_step     := interval '1 week';
    when '1y' then
      v_interval := interval '1 year';
      v_trunc    := 'month';
      v_fmt      := 'Mon YY';
      v_step     := interval '1 month';
    else
      -- default: same as 7d
      v_interval := interval '7 days';
      v_trunc    := 'day';
      v_fmt      := 'DD Mon';
      v_step     := interval '1 day';
  end case;

  return query
  with
  -- All activity events (user_id, event_at) across every activity source
  raw_events as (
    -- messages sent
    select sender_id as user_id, created_at as event_at
    from messages

    union all

    -- applications: both the applying player and the coach who owns the role were active
    select player_id as user_id, created_at as event_at
    from applications
    union all
    select o.coach_id as user_id, a.created_at as event_at
    from applications a
    join opportunities o on o.id = a.opportunity_id

    union all

    -- player profile views
    select viewer_id as user_id, viewed_at as event_at
    from player_views

    union all

    -- opportunities created
    select coach_id as user_id, created_at as event_at
    from opportunities

    union all

    -- community posts (not deleted)
    select author_id as user_id, created_at as event_at
    from posts
    where not coalesce(is_deleted, false)

    union all

    -- post likes
    select user_id, created_at as event_at
    from post_likes

    union all

    -- post comments (not deleted)
    select author_id as user_id, created_at as event_at
    from post_comments
    where not coalesce(is_deleted, false)

    union all

    -- match logs
    select player_id as user_id, created_at as event_at
    from performance_matches
  ),

  -- Filter to approved users within the window, attach role
  filtered as (
    select
      date_trunc(v_trunc, e.event_at) as slot,
      p.role
    from raw_events e
    join profiles p on p.id = e.user_id
    where
      p.approval_status = 'approved'
      and e.event_at >= date_trunc(v_trunc, now() - v_interval)
      and e.event_at <  now()
      and e.user_id is not null
  ),

  -- Count distinct active users per slot per role bucket
  counted as (
    select
      slot,
      count(*) filter (where role in ('player', 'admin')) as players,
      count(*) filter (where role = 'coach')               as coaches
    from (
      -- deduplicate: one row per (slot, user) before counting
      select distinct slot, user_id, role
      from (
        select
          date_trunc(v_trunc, e.event_at) as slot,
          e.user_id,
          p.role
        from raw_events e
        join profiles p on p.id = e.user_id
        where
          p.approval_status = 'approved'
          and e.event_at >= date_trunc(v_trunc, now() - v_interval)
          and e.event_at <  now()
          and e.user_id is not null
      ) deduped
    ) t
    group by slot
  ),

  -- Generate the full series of buckets so the chart never has gaps
  series as (
    select generate_series(
      date_trunc(v_trunc, now() - v_interval),
      date_trunc(v_trunc, now()),
      v_step
    ) as slot
  )

  select
    to_char(s.slot, v_fmt)           as bucket,
    coalesce(c.players, 0)::int      as players,
    coalesce(c.coaches, 0)::int      as coaches
  from series s
  left join counted c on c.slot = s.slot
  order by s.slot;
end;
$$;

grant execute on function public.analytics_daily_active_users(text) to authenticated;
