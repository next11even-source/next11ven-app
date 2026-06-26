-- Weekly metrics snapshot — powers the Telegram weekly report.
--
-- Design:
--  * One row per week, full metric payload stored as a single `metrics` jsonb column.
--    This means new metrics never require a schema change — we just add keys in the
--    function below. Week-over-week deltas are computed by the cron route reading the
--    previous row's `metrics` and diffing.
--  * analytics_weekly_snapshot() computes every metric for "now" (7-day windows where
--    the metric is a flow; point-in-time where it is a stock). Mirrors the style of
--    analytics_platform_stats() / analytics_revenue_stats().
--  * security definer + granted to service_role; called from /api/cron/weekly-metrics-telegram.

-- ─────────────────────────────────────────────────────────────────────────────
-- Snapshot table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists weekly_metrics_snapshot (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  metrics       jsonb not null,
  created_at    timestamptz not null default now()
);

alter table weekly_metrics_snapshot enable row level security;
-- No policies: only the service role (cron) reads/writes this. RLS-on + no policy
-- means authenticated/anon clients get nothing, which is what we want.

-- ─────────────────────────────────────────────────────────────────────────────
-- Snapshot computation
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function analytics_weekly_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
  v_week   interval := interval '7 days';
begin
  select jsonb_build_object(

    -- ══════════════════════════════════════════════════════════════════════
    -- SECTION A — Revenue & Monetisation
    -- ══════════════════════════════════════════════════════════════════════

    -- Total MRR (active subs, pence) — point in time
    'mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'active_subs', coalesce((
      select count(*)::int from stripe.subscriptions where status = 'active'
    ), 0),

    -- ARPU in pence = MRR / active subs (computed here so deltas are clean)
    'arpu_pence', coalesce((
      select case when count(*) = 0 then 0
        else round(
          sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)::numeric
          / count(*)
        )::bigint end
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'player_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active' and p.role in ('player', 'admin')
    ), 0),

    'coach_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active' and p.role = 'coach'
    ), 0),

    -- New premium this week — player (count + £)
    'new_premium_player_count', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= now() - v_week
        and s.status in ('active', 'trialing')
        and p.role in ('player', 'admin')
    ), 0),

    'new_premium_player_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= now() - v_week
        and s.status in ('active', 'trialing')
        and p.role in ('player', 'admin')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- New premium this week — coach (count + £)
    'new_premium_coach_count', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= now() - v_week
        and s.status in ('active', 'trialing')
        and p.role = 'coach'
    ), 0),

    'new_premium_coach_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= now() - v_week
        and s.status in ('active', 'trialing')
        and p.role = 'coach'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Total coach premium ever (for first-coach-conversion milestone detection)
    'coach_subs_all_time', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where p.role = 'coach'
    ), 0),

    -- Trial metrics (live once the 7-day trial is switched on; 0 until then)
    'trial_starts', coalesce((
      select count(*)::int from stripe.subscriptions
      where status = 'trialing'
        and to_timestamp(start_date) >= now() - v_week
    ), 0),

    'trial_active', coalesce((
      select count(*)::int from stripe.subscriptions where status = 'trialing'
    ), 0),

    -- Voluntary churn this week (cancelled, access ends in window) — count + £
    'voluntary_churn_count', coalesce((
      select count(*)::int
      from public.subscriptions ps
      where ps.status = 'canceled'
        and ps.current_period_end is not null
        and ps.current_period_end >= now() - v_week
    ), 0),

    'voluntary_churn_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status = 'canceled'
        and ps.current_period_end is not null
        and ps.current_period_end >= now() - v_week
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Involuntary churn signal: subs currently in dunning (failed payment) — count + £.
    -- Best-effort: public.subscriptions.status is set to past_due/unpaid by the webhook
    -- on invoice.payment_failed. Recovery is read week-over-week from the snapshot delta.
    'dunning_count', coalesce((
      select count(*)::int from public.subscriptions
      where status in ('past_due', 'unpaid')
    ), 0),

    'dunning_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status in ('past_due', 'unpaid')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Monetisation health
    'premium_players', coalesce((
      select count(*)::int from profiles
      where premium = true and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'actively_looking_premium', coalesce((
      select count(*)::int from profiles
      where premium = true and actively_looking = true
        and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    -- Active free users this week (conversion-rate denominator):
    -- approved, non-premium players signed in within the window
    'active_free_players', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'admin')
        and coalesce(p.premium, false) = false
        and au.last_sign_in_at >= now() - v_week
    ), 0),

    -- ══════════════════════════════════════════════════════════════════════
    -- SECTION B — App Usage & Engagement
    -- ══════════════════════════════════════════════════════════════════════

    -- Growth / acquisition (this week)
    'new_players', coalesce((
      select count(*)::int from profiles
      where role in ('player', 'admin') and created_at >= now() - v_week
    ), 0),

    'new_coaches', coalesce((
      select count(*)::int from profiles
      where role = 'coach' and created_at >= now() - v_week
    ), 0),

    -- Activation: new players this week with >= 8 of the 12 completion fields filled.
    -- Mirrors lib/profileCompletion.ts COMPLETION_CHECKS exactly.
    'new_players_completed', coalesce((
      select count(*)::int from profiles p
      where p.role in ('player', 'admin')
        and p.created_at >= now() - v_week
        and (
          (case when nullif(p.avatar_url, '') is not null then 1 else 0 end)
        + (case when nullif(p.position, '') is not null then 1 else 0 end)
        + (case when nullif(p.club, '') is not null then 1 else 0 end)
        + (case when nullif(p.city, '') is not null then 1 else 0 end)
        + (case when nullif(p.status, '') is not null then 1 else 0 end)
        + (case when nullif(p.phone, '') is not null then 1 else 0 end)
        + (case when p.date_of_birth is not null then 1 else 0 end)
        + (case when nullif(p.foot, '') is not null then 1 else 0 end)
        + (case when nullif(p.height, '') is not null then 1 else 0 end)
        + (case when nullif(p.playing_level, '') is not null then 1 else 0 end)
        + (case when coalesce(array_length(p.highlight_urls, 1), 0) > 0 then 1 else 0 end)
        + (case when coalesce(p.goals, 0) > 0 or coalesce(p.assists, 0) > 0 or coalesce(p.appearances, 0) > 0 then 1 else 0 end)
        ) >= 8
    ), 0),

    -- New coaches this week with >= 6 of the 9 coach completion fields (proportional ~67%)
    'new_coaches_completed', coalesce((
      select count(*)::int from profiles p
      where p.role = 'coach'
        and p.created_at >= now() - v_week
        and (
          (case when nullif(p.avatar_url, '') is not null then 1 else 0 end)
        + (case when nullif(p.full_name, '') is not null then 1 else 0 end)
        + (case when nullif(p.coaching_role, '') is not null then 1 else 0 end)
        + (case when nullif(p.coaching_level, '') is not null then 1 else 0 end)
        + (case when nullif(p.club, '') is not null then 1 else 0 end)
        + (case when nullif(p.city, '') is not null then 1 else 0 end)
        + (case when nullif(p.phone, '') is not null then 1 else 0 end)
        + (case when nullif(p.bio, '') is not null then 1 else 0 end)
        + (case when nullif(p.coaching_history, '') is not null then 1 else 0 end)
        ) >= 6
    ), 0),

    -- Total registered (approved) by role
    'total_players', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'total_coaches', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role = 'coach'
    ), 0),

    -- Active users (signed in within the 7-day window)
    'wau_total', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - v_week
    ), 0),

    'wau_players', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'admin')
        and au.last_sign_in_at >= now() - v_week
    ), 0),

    'wau_coaches', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role = 'coach'
        and au.last_sign_in_at >= now() - v_week
    ), 0),

    -- Returning vs new actives: "new" = active AND signed up within the window
    'wau_new', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - v_week
        and p.created_at >= now() - v_week
    ), 0),

    'dau', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '1 day'
    ), 0),

    -- Supply side
    'opportunities_posted', coalesce((
      select count(*)::int from opportunities where created_at >= now() - v_week
    ), 0),

    'opportunities_total', coalesce((
      select count(*)::int from opportunities
    ), 0),

    'applications_submitted', coalesce((
      select count(*)::int from applications where created_at >= now() - v_week
    ), 0),

    -- Application → response rate this week: % of this week's applications that got
    -- any coach action (status moved off 'pending')
    'application_response_rate_pct', (
      select case
        when count(*) = 0 then null
        else round(count(*) filter (where status <> 'pending') * 100.0 / count(*))::int
      end
      from applications
      where created_at >= now() - v_week
    ),

    -- Total Actively Looking players live (stock)
    'actively_looking_live', coalesce((
      select count(*)::int from profiles
      where actively_looking = true and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    -- Total free agents (status field; WoW delta = net free-agent movement)
    'total_free_agents', coalesce((
      select count(*)::int from profiles
      where status = 'free_agent' and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    -- Messaging (this week, by sender role)
    'messages_total', coalesce((
      select count(*)::int from messages where created_at >= now() - v_week
    ), 0),

    'messages_coach_first', coalesce((
      select count(*)::int
      from messages m join profiles p on p.id = m.sender_id
      where m.created_at >= now() - v_week and p.role = 'coach'
    ), 0),

    'messages_player_first', coalesce((
      select count(*)::int
      from messages m join profiles p on p.id = m.sender_id
      where m.created_at >= now() - v_week and p.role in ('player', 'admin')
    ), 0),

    -- First-message reply rate: player-initiated convos started this week where the
    -- coach has replied
    'first_reply_rate_pct', (
      select case
        when count(*) = 0 then null
        else round(count(*) filter (where coach_replied_at is not null) * 100.0 / count(*))::int
      end
      from conversations
      where created_at >= now() - v_week
        and initiated_by = player_id
    ),

    -- Median hours to first reply (player-initiated convos started this week that got a reply)
    'median_first_reply_hours', (
      select round(
        percentile_cont(0.5) within group (
          order by extract(epoch from (coach_replied_at - created_at)) / 3600.0
        )::numeric, 1
      )
      from conversations
      where created_at >= now() - v_week
        and initiated_by = player_id
        and coach_replied_at is not null
    ),

    -- Shortlisting & views
    'new_shortlists', coalesce((
      select count(*)::int from coach_saved_players where created_at >= now() - v_week
    ), 0),

    'total_shortlisted', coalesce((
      select count(distinct player_id)::int from coach_saved_players
    ), 0),

    'profile_views_total', coalesce((
      select count(*)::int from player_views where viewed_at >= now() - v_week
    ), 0),

    -- Average views per active player this week
    'avg_views_per_active_player', (
      select case
        when wau.n = 0 then null
        else round(pv.n::numeric / wau.n, 1)
      end
      from
        (select count(*)::int as n from player_views where viewed_at >= now() - v_week) pv,
        (select count(distinct p.id)::int as n
           from profiles p join auth.users au on au.id = p.id
          where p.approval_status = 'approved' and p.role in ('player', 'admin')
            and au.last_sign_in_at >= now() - v_week) wau
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_weekly_snapshot() to service_role;
