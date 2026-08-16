-- Layer 1 hero row: the ~5 numbers that answer "what would I do differently
-- based on this?" — a dedicated, lean function rather than bolting more
-- fields onto analytics_platform_stats()/analytics_revenue_stats(), which
-- already carry the heavier Health-tab detail this row is meant to sit above.
--
-- Each metric returns { current, previous } so the UI can show this-month-vs-
-- last-month movement. "Active coaches" is the one rolling (30d) metric here
-- (mirrors the existing mau/mau_prev pattern) — everything else is calendar-
-- month, matching how monthly_table already reports flow metrics.
--
-- "Paying" follows the same definition analytics_revenue_stats() uses: the
-- customer's MOST RECENT invoice was genuinely paid, not just "has an active
-- subscription" (which would double-count comped/free accounts as revenue
-- events). new_mrr/churned_mrr and premium_conversions all filter on it.

create or replace function analytics_hero_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
begin
  with latest_invoice as (
    select distinct on (i.customer)
      i.customer, i.status, i.amount_paid
    from stripe.invoices i
    order by i.customer, i.period_start desc
  ),
  new_mrr_month as (
    select
      date_trunc('month', to_timestamp(s.start_date))::date as month,
      sum((s.items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(s.start_date) >= date_trunc('month', now() - interval '1 month')
    group by 1
  ),
  churned_mrr_month as (
    select
      date_trunc('month', to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))))::date as month,
      sum((s.items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where (s.cancel_at_period_end = true or s.status = 'canceled')
      and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
      and s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= date_trunc('month', now() - interval '1 month')
    group by 1
  ),
  premium_conversions_month as (
    -- Deliberately not filtered to currently-active subscriptions — a
    -- conversion that already churned within the same month is still a
    -- conversion event that happened. Matches monthly_table's new_subs CTE.
    select
      date_trunc('month', to_timestamp(s.start_date))::date as month,
      p.role,
      count(distinct p.id)::int as n
    from stripe.subscriptions s
    join profiles p on p.stripe_customer_id = s.customer
    join latest_invoice li on li.customer = s.customer
    where to_timestamp(s.start_date) >= date_trunc('month', now() - interval '1 month')
      and li.status = 'paid' and li.amount_paid > 0
    group by 1, 2
  )
  select jsonb_build_object(

    'active_coaches_30d', jsonb_build_object(
      'current', coalesce((
        select count(distinct p.id)::int
        from profiles p
        where p.role = 'coach'
          and (
            exists (select 1 from opportunities o where o.coach_id = p.id and o.created_at >= now() - interval '30 days')
            or exists (select 1 from messages m where m.sender_id = p.id and m.created_at >= now() - interval '30 days')
          )
      ), 0),
      'previous', coalesce((
        select count(distinct p.id)::int
        from profiles p
        where p.role = 'coach'
          and (
            exists (
              select 1 from opportunities o
              where o.coach_id = p.id
                and o.created_at >= now() - interval '60 days' and o.created_at < now() - interval '30 days'
            )
            or exists (
              select 1 from messages m
              where m.sender_id = p.id
                and m.created_at >= now() - interval '60 days' and m.created_at < now() - interval '30 days'
            )
          )
      ), 0)
    ),

    'net_new_mrr_pence', jsonb_build_object(
      'current',
        coalesce((select mrr_pence from new_mrr_month where month = date_trunc('month', now())::date), 0)
        - coalesce((select mrr_pence from churned_mrr_month where month = date_trunc('month', now())::date), 0),
      'previous',
        coalesce((select mrr_pence from new_mrr_month where month = date_trunc('month', now() - interval '1 month')::date), 0)
        - coalesce((select mrr_pence from churned_mrr_month where month = date_trunc('month', now() - interval '1 month')::date), 0)
    ),

    'opportunities_posted', jsonb_build_object(
      'current', coalesce((
        select count(*)::int from opportunities where created_at >= date_trunc('month', now())
      ), 0),
      'previous', coalesce((
        select count(*)::int from opportunities
        where created_at >= date_trunc('month', now() - interval '1 month')
          and created_at < date_trunc('month', now())
      ), 0)
    ),

    'connections_started', jsonb_build_object(
      'current', coalesce((
        select count(*)::int from conversations where created_at >= date_trunc('month', now())
      ), 0),
      'previous', coalesce((
        select count(*)::int from conversations
        where created_at >= date_trunc('month', now() - interval '1 month')
          and created_at < date_trunc('month', now())
      ), 0)
    ),

    'premium_conversions', jsonb_build_object(
      'current', jsonb_build_object(
        'player', coalesce((
          select sum(n) from premium_conversions_month
          where month = date_trunc('month', now())::date and role in ('player', 'admin')
        ), 0),
        'coach', coalesce((
          select sum(n) from premium_conversions_month
          where month = date_trunc('month', now())::date and role = 'coach'
        ), 0)
      ),
      'previous', jsonb_build_object(
        'player', coalesce((
          select sum(n) from premium_conversions_month
          where month = date_trunc('month', now() - interval '1 month')::date and role in ('player', 'admin')
        ), 0),
        'coach', coalesce((
          select sum(n) from premium_conversions_month
          where month = date_trunc('month', now() - interval '1 month')::date and role = 'coach'
        ), 0)
      )
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_hero_stats() to service_role;
