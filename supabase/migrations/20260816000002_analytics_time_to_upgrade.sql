-- Layer 3 conversion intelligence: time from signup to upgrade. Unlike the
-- paywall-trigger attribution (which needs premium_clicks to accrue history
-- from today), this is fully computable from existing data — profiles.created_at
-- vs the paying subscription's start_date — so it ships now rather than waiting
-- on new logging. Bucketed same-day / within-week / within-month / longer per
-- the "impulse vs considered" framing from the analytics brief.
--
-- Reuses analytics_revenue_stats()'s existing `paying` CTE (currently-active,
-- genuinely-paid subscriptions, deduped per customer) — just carries start_date
-- through active_deduped so it's available on `paying` too.

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
  with active_deduped as (
    select distinct on (s.customer)
      s.customer,
      s.cancel_at_period_end,
      s.start_date,
      s.items->'data'->0->'price'->>'id'                    as price_id,
      (s.items->'data'->0->'price'->>'unit_amount')::bigint  as unit_amount_pence,
      s.items->'data'->0->'price'->>'currency'               as currency,
      p.id                                                    as profile_id,
      p.role
    from stripe.subscriptions s
    join profiles p on p.stripe_customer_id = s.customer
    where s.status = 'active'
    order by s.customer, s.start_date desc
  ),
  latest_invoice as (
    -- Current state, not history — a customer who paid before but is now
    -- comped (£0 latest invoice) must not count as paying.
    select distinct on (i.customer)
      i.customer, i.status, i.amount_paid
    from stripe.invoices i
    order by i.customer, i.period_start desc
  ),
  paying as (
    select ad.*
    from active_deduped ad
    join latest_invoice li on li.customer = ad.customer
    where li.status = 'paid' and li.amount_paid > 0
  )
  select jsonb_build_object(

    'mrr_pence', coalesce((
      select sum(unit_amount_pence) from paying where unit_amount_pence is not null
    ), 0),

    'active_subs', coalesce((select count(*)::int from paying), 0),

    'cancelling', coalesce((select count(*)::int from paying where cancel_at_period_end = true), 0),

    'player_subs', coalesce((
      select count(distinct profile_id)::int from paying where role in ('player', 'admin')
    ), 0),

    'coach_subs', coalesce((
      select count(distinct profile_id)::int from paying where role = 'coach'
    ), 0),

    'player_mrr_pence', coalesce((
      select sum(unit_amount_pence) from paying where role in ('player', 'admin') and unit_amount_pence is not null
    ), 0),

    'coach_mrr_pence', coalesce((
      select sum(unit_amount_pence) from paying where role = 'coach' and unit_amount_pence is not null
    ), 0),

    'free_sub_count', coalesce((
      select count(*)::int from active_deduped ad
      where not exists (
        select 1 from latest_invoice li
        where li.customer = ad.customer and li.status = 'paid' and li.amount_paid > 0
      )
    ), 0),

    'price_breakdown', coalesce((
      select jsonb_agg(row_data order by unit_amount_pence asc)
      from (
        select
          price_id, unit_amount_pence, currency,
          count(*)::int as subscriber_count,
          sum(unit_amount_pence)::bigint as mrr_pence
        from paying
        where unit_amount_pence is not null
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
        join latest_invoice li on li.customer = s.customer
        where p.role = 'coach'
          and to_timestamp(s.start_date) >= now() - interval '4 months'
          and li.status = 'paid' and li.amount_paid > 0
        group by 1
      ),
      coach_churned as (
        select
          date_trunc('month', to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))))::timestamptz as month,
          count(*)::int as n
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.customer
        join latest_invoice li on li.customer = s.customer
        where p.role = 'coach'
          and (s.cancel_at_period_end = true or s.status = 'canceled')
          and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
          and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= now() - interval '4 months'
          and li.status = 'paid' and li.amount_paid > 0
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object('label', to_char(m.month, 'Mon YY'), 'net_adds', coalesce(cn.n, 0) - coalesce(cc.n, 0))
        order by m.month asc
      )
      from months m
      left join coach_new     cn on cn.month = m.month
      left join coach_churned cc on cc.month = m.month
    ), '[]'::jsonb),

    -- Time from signup to upgrade, bucketed same-day (impulse) through
    -- longer (considered). Always returns one row (aggregates over zero
    -- rows still produce a row), so the coalesce fallback is a belt-and-
    -- braces match for this file's existing style, not a reachable path.
    'time_to_upgrade', coalesce((
      select jsonb_build_object(
        'avg_days', round(avg(extract(epoch from (to_timestamp(pay.start_date) - p.created_at)) / 86400))::int,
        'same_day', count(*) filter (where to_timestamp(pay.start_date) - p.created_at < interval '1 day'),
        'within_week', count(*) filter (
          where to_timestamp(pay.start_date) - p.created_at >= interval '1 day'
            and to_timestamp(pay.start_date) - p.created_at < interval '7 days'
        ),
        'within_month', count(*) filter (
          where to_timestamp(pay.start_date) - p.created_at >= interval '7 days'
            and to_timestamp(pay.start_date) - p.created_at < interval '30 days'
        ),
        'longer', count(*) filter (where to_timestamp(pay.start_date) - p.created_at >= interval '30 days'),
        'total', count(*)
      )
      from paying pay
      join profiles p on p.id = pay.profile_id
    ), jsonb_build_object(
      'avg_days', null, 'same_day', 0, 'within_week', 0, 'within_month', 0, 'longer', 0, 'total', 0
    )),

    'churn_risk', coalesce((
      select jsonb_agg(row_data order by last_seen asc nulls first)
      from (
        select
          p.id, p.full_name, p.role, p.club,
          au.last_sign_in_at                  as last_seen,
          to_timestamp(s.current_period_end)  as period_end
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.customer
        join auth.users au on au.id = p.id
        join latest_invoice li on li.customer = s.customer
        where s.status = 'active'
          and s.cancel_at_period_end = false
          and (au.last_sign_in_at is null or au.last_sign_in_at < now() - interval '14 days')
          and li.status = 'paid' and li.amount_paid > 0
        order by au.last_sign_in_at asc nulls first
        limit 20
      ) row_data
    ), '[]'::jsonb),

    'non_converting_count', coalesce((
      select count(*)::int
      from profiles p
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and not exists (select 1 from paying pay where pay.profile_id = p.id)
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_revenue_stats() to service_role;
