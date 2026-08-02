-- Reframe admin analytics around flow/leading-indicators instead of stock totals.
-- Extends the existing analytics_platform_stats() / analytics_revenue_stats()
-- functions (same pattern: one jsonb-returning security definer function per
-- endpoint, aggregate-only SQL, no row-level payloads).
--
-- Changes:
--   analytics_platform_stats():
--     - new_mrr_pence / churned_mrr_pence: rolling 30d instead of calendar-month
--       (calendar-month resets to ~0 on the 1st, which reads as a false crash)
--     - monthly_table: add per-month new_mrr_pence/churned_mrr_pence alongside
--       the existing counts, for the Net New MRR sparkline
--     - weekly_active_coaches, player_premium_conversions_7d
--     - contacts_7d: conversations.created_at (was wrongly keyed off
--       last_message_at elsewhere — see message-stats route fix)
--     - actively_looking_total / actively_looking_contacted_7d
--     - avg_time_to_first_contact_hours
--     - activation_numerator_7d / activation_denominator_7d
--   analytics_revenue_stats():
--     - free_sub_count (moves this off the live-Stripe-API call in the route,
--       so mrr_pence has exactly one source: the synced stripe.subscriptions table)
--     - coach_net_adds_monthly: last 4 months of coach-only net adds, for the
--       Coach Pro standing-alarm state (red/amber/green vs last month)

create or replace function analytics_platform_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(

    'mau', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '30 days'
    ), 0),

    'mau_prev', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '60 days'
        and au.last_sign_in_at < now() - interval '30 days'
    ), 0),

    'dau', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '1 day'
    ), 0),

    'ever_signed_in', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at is not null
    ), 0),

    -- Weekly active coaches: leading indicator paired against premium conversions
    'weekly_active_coaches', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role = 'coach'
        and au.last_sign_in_at >= now() - interval '7 days'
    ), 0),

    -- Players who converted to premium in the last 7 days
    'player_premium_conversions_7d', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where p.role in ('player', 'admin')
        and s.status in ('active', 'trialing')
        and to_timestamp(s.start_date) >= now() - interval '7 days'
    ), 0),

    -- Connections made this week — keyed off created_at (conversation START),
    -- not last_message_at. Fixes a stale metric that was counting recently
    -- ACTIVE conversations rather than newly FORMED ones.
    'contacts_7d', coalesce((
      select count(*)::int from conversations
      where created_at >= now() - interval '7 days'
    ), 0),

    -- "Get seen" promise, measured: how many Actively Looking players are
    -- actually receiving a view or a contact.
    'actively_looking_total', coalesce((
      select count(*)::int from profiles
      where actively_looking = true
    ), 0),

    'actively_looking_contacted_7d', coalesce((
      select count(*)::int
      from profiles p
      where p.actively_looking = true
        and (
          exists (
            select 1 from player_views pv
            where pv.player_id = p.id and pv.viewed_at >= now() - interval '7 days'
          )
          or exists (
            select 1 from conversations c
            where c.player_id = p.id and c.last_message_at >= now() - interval '7 days'
          )
        )
    ), 0),

    -- Time-to-first-contact for recently signed-up players (last 60 days),
    -- measured from account creation to their earliest view or conversation.
    'avg_time_to_first_contact_hours', (
      select round(avg(
        extract(epoch from (t.first_contact - t.created_at)) / 3600
      ))::int
      from (
        select
          p.id,
          p.created_at,
          least(
            coalesce((select min(pv.viewed_at) from player_views pv where pv.player_id = p.id), 'infinity'::timestamptz),
            coalesce((select min(c.created_at) from conversations c where c.player_id = p.id), 'infinity'::timestamptz)
          ) as first_contact
        from profiles p
        where p.role in ('player', 'admin')
          and p.approval_status = 'approved'
          and p.created_at >= now() - interval '60 days'
      ) t
      where t.first_contact < 'infinity'::timestamptz
    ),

    -- Activation: new signups (last 7 days) who showed any signal of intent —
    -- viewed/viewer, messaged, logged a match, or posted a role. Single
    -- predicate covers both player and coach signals; every signup in this
    -- window is at most 7 days old so no extra per-user date bound is needed.
    'activation_denominator_7d', coalesce((
      select count(*)::int from profiles
      where role in ('player', 'coach', 'admin')
        and created_at >= now() - interval '7 days'
    ), 0),

    'activation_numerator_7d', coalesce((
      select count(*)::int
      from profiles p
      where p.role in ('player', 'coach', 'admin')
        and p.created_at >= now() - interval '7 days'
        and (
          exists (select 1 from messages m where m.sender_id = p.id)
          or exists (select 1 from conversations c where c.player_id = p.id or c.coach_id = p.id)
          or exists (select 1 from player_views pv where pv.player_id = p.id or pv.viewer_id = p.id)
          or exists (select 1 from performance_matches pm where pm.player_id = p.id)
          or exists (select 1 from opportunities o where o.coach_id = p.id)
        )
    ), 0),

    'player_count', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'coach_count', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role = 'coach'
    ), 0),

    'reply_rate_pct', (
      select
        case
          when count(*) filter (where initiated_by = player_id) = 0 then null
          else round(
            count(*) filter (where initiated_by = player_id and coach_replied_at is not null)
            * 100.0 /
            count(*) filter (where initiated_by = player_id)
          )::int
        end
      from conversations
      where last_message_at >= now() - interval '90 days'
    ),

    'reply_total_convos', coalesce((
      select count(*)::int from conversations
      where initiated_by = player_id
        and last_message_at >= now() - interval '90 days'
    ), 0),

    'open_opportunities', coalesce((
      select count(*)::int from opportunities
    ), 0),

    'pending_approvals', coalesce((
      select count(*)::int from profiles
      where approval_status = 'pending' and role in ('player', 'coach')
    ), 0),

    'funnel', jsonb_build_object(
      'registered', coalesce((
        select count(*)::int from profiles where role in ('player', 'coach', 'admin')
      ), 0),
      'approved', coalesce((
        select count(*)::int from profiles
        where approval_status = 'approved' and role in ('player', 'coach', 'admin')
      ), 0),
      'active_30d', coalesce((
        select count(distinct p.id)::int
        from profiles p
        join auth.users au on au.id = p.id
        where p.approval_status = 'approved'
          and p.role in ('player', 'coach', 'admin')
          and au.last_sign_in_at >= now() - interval '30 days'
      ), 0),
      'premium', coalesce((
        select count(*)::int from profiles
        where premium = true
          and approval_status = 'approved'
          and role in ('player', 'coach', 'admin')
      ), 0)
    ),

    'monthly_table', coalesce((
      with months as (
        select generate_series(
          date_trunc('month', now() - interval '5 months'),
          date_trunc('month', now()),
          '1 month'
        )::timestamptz as month
      ),
      signups as (
        select date_trunc('month', created_at)::timestamptz as month, count(*)::int as n
        from profiles
        where role in ('player', 'coach', 'admin')
          and created_at >= now() - interval '6 months'
        group by 1
      ),
      new_subs as (
        select
          date_trunc('month', to_timestamp(start_date))::timestamptz as month,
          count(*)::int as n,
          sum((items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
        from stripe.subscriptions
        where to_timestamp(start_date) >= now() - interval '6 months'
          and items->'data'->0->'price'->>'unit_amount' is not null
        group by 1
      ),
      churned as (
        select
          date_trunc('month', to_timestamp(coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0))))::timestamptz as month,
          count(*)::int as n,
          sum((items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
        from stripe.subscriptions
        where (cancel_at_period_end = true or status = 'canceled')
          and coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0)) is not null
          and to_timestamp(coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0))) >= now() - interval '6 months'
          and items->'data'->0->'price'->>'unit_amount' is not null
        group by 1
      ),
      msgs as (
        select date_trunc('month', created_at)::timestamptz as month, count(*)::int as n
        from messages
        where created_at >= now() - interval '6 months'
        group by 1
      ),
      apps as (
        select date_trunc('month', created_at)::timestamptz as month, count(*)::int as n
        from applications
        where created_at >= now() - interval '6 months'
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object(
          'label',              to_char(m.month, 'Mon YY'),
          'new_signups',        coalesce(sig.n, 0),
          'new_premium',        coalesce(ns.n, 0),
          'churned',            coalesce(ch.n, 0),
          'messages',           coalesce(mg.n, 0),
          'applications',       coalesce(ap.n, 0),
          'new_mrr_pence',      coalesce(ns.mrr_pence, 0),
          'churned_mrr_pence',  coalesce(ch.mrr_pence, 0)
        )
        order by m.month asc
      )
      from months m
      left join signups  sig on sig.month = m.month
      left join new_subs ns  on ns.month  = m.month
      left join churned  ch  on ch.month  = m.month
      left join msgs     mg  on mg.month  = m.month
      left join apps     ap  on ap.month  = m.month
    ), '[]'::jsonb),

    -- Net new MRR: rolling 30 days, not calendar-month (which reads as a false
    -- crash on the 1st of every month).
    'new_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where to_timestamp(s.start_date) >= now() - interval '30 days'
        and s.status in ('active', 'trialing')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'churned_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where (s.cancel_at_period_end = true or s.status = 'canceled')
        and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
        and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= now() - interval '30 days'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'legacy_count', coalesce((
      select count(*)::int from stripe.subscriptions s
      where s.status = 'active'
        and (s.items->'data'->0->'price'->>'unit_amount')::bigint < 699
    ), 0),

    'legacy_upgrade_pence', coalesce((
      select sum(699 - (s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and (s.items->'data'->0->'price'->>'unit_amount')::bigint < 699
    ), 0),

    'showcase_confirmed', coalesce((
      select count(*)::int from profiles where showcase_confirmed = true
    ), 0),

    'showcase_this_month', coalesce((
      select count(*)::int from profiles
      where showcase_confirmed = true
        and showcase_confirmed_at >= date_trunc('month', now())
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_platform_stats() to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_revenue_stats: add free_sub_count (removes the need for the route's
-- separate live-Stripe-API call — mrr_pence now has exactly one source) and
-- coach_net_adds_monthly (Coach Pro standing-alarm state).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function analytics_revenue_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(

    'mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'active_subs', coalesce((
      select count(*)::int from stripe.subscriptions where status = 'active'
    ), 0),

    'cancelling', coalesce((
      select count(*)::int from stripe.subscriptions
      where status = 'active' and cancel_at_period_end = true
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

    'player_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role in ('player', 'admin')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'coach_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role = 'coach'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Active subs with a £0 effective price (complimentary plans / 100% off codes)
    'free_sub_count', coalesce((
      select count(*)::int
      from stripe.subscriptions s
      where s.status = 'active'
        and (s.items->'data'->0->'price'->>'unit_amount')::bigint = 0
    ), 0),

    'price_breakdown', coalesce((
      select jsonb_agg(row_data order by unit_amount_pence asc)
      from (
        select
          s.items->'data'->0->'price'->>'id'                    as price_id,
          (s.items->'data'->0->'price'->>'unit_amount')::bigint  as unit_amount_pence,
          s.items->'data'->0->'price'->>'currency'               as currency,
          count(*)::int                                           as subscriber_count,
          sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)::bigint as mrr_pence
        from stripe.subscriptions s
        where s.status = 'active'
          and s.items->'data'->0->'price'->>'unit_amount' is not null
        group by price_id, unit_amount_pence, currency
      ) row_data
    ), '[]'::jsonb),

    'mrr_trend', coalesce((
      select jsonb_agg(row_data order by month_start)
      from (
        select
          to_char(to_timestamp(period_start), 'Mon YY')          as label,
          date_trunc('month', to_timestamp(period_start))         as month_start,
          sum(amount_paid)                                         as value
        from stripe.invoices
        where status = 'paid'
          and subscription is not null
          and to_timestamp(period_start) >= now() - interval '6 months'
        group by label, month_start
      ) row_data
    ), '[]'::jsonb),

    -- Coach Pro net adds, last 4 months — drives the standing-alarm state
    -- (red if flat/declining, amber on any net add, green at 3+ consecutive
    -- months of growth), computed client-side from this array.
    'coach_net_adds_monthly', coalesce((
      with months as (
        select generate_series(
          date_trunc('month', now() - interval '3 months'),
          date_trunc('month', now()),
          '1 month'
        )::timestamptz as month
      ),
      coach_new as (
        select date_trunc('month', to_timestamp(s.start_date))::timestamptz as month, count(*)::int as n
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.customer
        where p.role = 'coach'
          and to_timestamp(s.start_date) >= now() - interval '4 months'
        group by 1
      ),
      coach_churned as (
        select
          date_trunc('month', to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))))::timestamptz as month,
          count(*)::int as n
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.customer
        where p.role = 'coach'
          and (s.cancel_at_period_end = true or s.status = 'canceled')
          and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
          and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= now() - interval '4 months'
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object(
          'label', to_char(m.month, 'Mon YY'),
          'net_adds', coalesce(cn.n, 0) - coalesce(cc.n, 0)
        )
        order by m.month asc
      )
      from months m
      left join coach_new     cn on cn.month = m.month
      left join coach_churned cc on cc.month = m.month
    ), '[]'::jsonb),

    'churn_risk', coalesce((
      select jsonb_agg(row_data order by last_seen asc nulls first)
      from (
        select
          p.id,
          p.full_name,
          p.role,
          p.club,
          au.last_sign_in_at                  as last_seen,
          to_timestamp(s.current_period_end)  as period_end
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.customer
        join auth.users au on au.id = p.id
        where s.status = 'active'
          and s.cancel_at_period_end = false
          and (au.last_sign_in_at is null or au.last_sign_in_at < now() - interval '14 days')
        order by au.last_sign_in_at asc nulls first
        limit 20
      ) row_data
    ), '[]'::jsonb),

    'non_converting_count', coalesce((
      select count(*)::int
      from profiles p
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and not exists (
          select 1 from stripe.subscriptions s
          where s.customer = p.stripe_customer_id
            and s.status = 'active'
        )
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_revenue_stats() to service_role;
