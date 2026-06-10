-- Add DAU, showcase stats, avg subscription age, and weekly MRR chart data
-- to analytics functions for the redesigned analytics dashboard.

-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_revenue_stats: add avg_sub_age_days, mrr_weekly_current, mrr_weekly_prior
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

    -- Legacy monthly trend kept for backward compat
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

    -- Weekly MRR: current 12 weeks, oldest first (index 0 = 11 weeks ago)
    'mrr_weekly_current', coalesce((
      with week_series as (
        select generate_series(11, 0, -1) as weeks_ago
      ),
      week_sums as (
        select
          floor(extract(epoch from (now() - to_timestamp(period_start))) / 604800)::int as weeks_ago,
          sum(amount_paid)::bigint as v
        from stripe.invoices
        where status = 'paid'
          and subscription is not null
          and to_timestamp(period_start) >= now() - interval '12 weeks'
        group by 1
      )
      select jsonb_agg(coalesce(s.v, 0) order by ws.weeks_ago desc)
      from week_series ws
      left join week_sums s
        on s.weeks_ago = ws.weeks_ago
        and s.weeks_ago between 0 and 11
    ), '[]'::jsonb),

    -- Weekly MRR: prior 12 weeks (12–24 weeks ago), aligned to same positions
    'mrr_weekly_prior', coalesce((
      with week_series as (
        select generate_series(11, 0, -1) as week_pos
      ),
      week_sums as (
        select
          (floor(extract(epoch from (now() - to_timestamp(period_start))) / 604800)::int - 12) as week_pos,
          sum(amount_paid)::bigint as v
        from stripe.invoices
        where status = 'paid'
          and subscription is not null
          and to_timestamp(period_start) >= now() - interval '24 weeks'
          and to_timestamp(period_start) < now() - interval '12 weeks'
        group by 1
      )
      select jsonb_agg(coalesce(s.v, 0) order by ws.week_pos desc)
      from week_series ws
      left join week_sums s
        on s.week_pos = ws.week_pos
        and s.week_pos between 0 and 11
    ), '[]'::jsonb),

    -- Average subscription age in days for active subscribers
    'avg_sub_age_days', coalesce((
      select round(avg(
        extract(epoch from (now() - to_timestamp(start_date))) / 86400
      ))::int
      from stripe.subscriptions
      where status = 'active'
        and start_date is not null
        and start_date > 0
    ), 0),

    'non_converting_count', coalesce((
      select count(*)::int
      from profiles p
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and not exists (
          select 1 from stripe.subscriptions s
          where s.customer = p.stripe_customer_id and s.status = 'active'
        )
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_revenue_stats() to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_platform_stats: add dau, showcase_confirmed, showcase_this_month
-- ─────────────────────────────────────────────────────────────────────────────

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

    -- Daily active users: signed in within last 24 hours
    'dau', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '1 day'
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
        select date_trunc('month', to_timestamp(start_date))::timestamptz as month, count(*)::int as n
        from stripe.subscriptions
        where to_timestamp(start_date) >= now() - interval '6 months'
        group by 1
      ),
      churned as (
        select
          date_trunc('month', to_timestamp(coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0))))::timestamptz as month,
          count(*)::int as n
        from stripe.subscriptions
        where (cancel_at_period_end = true or status = 'canceled')
          and coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0)) is not null
          and to_timestamp(coalesce(nullif(cancel_at, 0), nullif(canceled_at, 0))) >= now() - interval '6 months'
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
          'label',        to_char(m.month, 'Mon YY'),
          'new_signups',  coalesce(sig.n, 0),
          'new_premium',  coalesce(ns.n, 0),
          'churned',      coalesce(ch.n, 0),
          'messages',     coalesce(mg.n, 0),
          'applications', coalesce(ap.n, 0)
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

    'new_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where to_timestamp(s.start_date) >= date_trunc('month', now())
        and s.status in ('active', 'trialing')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    'churned_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where (s.cancel_at_period_end = true or s.status = 'canceled')
        and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
        and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= date_trunc('month', now())
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

    -- Showcase: players who have confirmed attendance
    'showcase_confirmed', coalesce((
      select count(*)::int from profiles
      where showcase_confirmed = true
    ), 0),

    -- Showcase confirmations that happened this calendar month
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
