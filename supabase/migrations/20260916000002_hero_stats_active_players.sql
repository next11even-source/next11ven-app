-- Add active_players_30d to analytics_hero_stats().
-- Same pattern as active_coaches_30d: rolling 30d vs prior 30d.
-- "Active" = sent a message OR submitted an application in the window.
-- Role filter includes 'admin' (counts as a player per platform doctrine).

create or replace function analytics_hero_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
  v_month_start timestamptz := date_trunc('month', now());
  v_prev_month_start timestamptz := date_trunc('month', now() - interval '1 month');
  -- Same elapsed time-of-month as "now", carried into the previous month
  v_prev_cutoff timestamptz := v_prev_month_start + (now() - v_month_start);
begin
  with latest_invoice as (
    select distinct on (i.customer)
      i.customer, i.status, i.amount_paid
    from stripe.invoices i
    order by i.customer, i.period_start desc
  ),
  new_mrr_current as (
    select coalesce(sum((s.items->'data'->0->'price'->>'unit_amount')::bigint), 0) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(s.start_date) >= v_month_start
  ),
  new_mrr_previous as (
    select coalesce(sum((s.items->'data'->0->'price'->>'unit_amount')::bigint), 0) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(s.start_date) >= v_prev_month_start
      and to_timestamp(s.start_date) < v_prev_cutoff
  ),
  churned_mrr_current as (
    select coalesce(sum((s.items->'data'->0->'price'->>'unit_amount')::bigint), 0) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where (s.cancel_at_period_end = true or s.status = 'canceled')
      and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
      and s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= v_month_start
  ),
  churned_mrr_previous as (
    select coalesce(sum((s.items->'data'->0->'price'->>'unit_amount')::bigint), 0) as mrr_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where (s.cancel_at_period_end = true or s.status = 'canceled')
      and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
      and s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= v_prev_month_start
      and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) < v_prev_cutoff
  ),
  premium_conversions_current as (
    select p.role, count(distinct p.id)::int as n
    from stripe.subscriptions s
    join profiles p on p.stripe_customer_id = s.customer
    join latest_invoice li on li.customer = s.customer
    where to_timestamp(s.start_date) >= v_month_start
      and li.status = 'paid' and li.amount_paid > 0
    group by p.role
  ),
  premium_conversions_previous as (
    select p.role, count(distinct p.id)::int as n
    from stripe.subscriptions s
    join profiles p on p.stripe_customer_id = s.customer
    join latest_invoice li on li.customer = s.customer
    where to_timestamp(s.start_date) >= v_prev_month_start
      and to_timestamp(s.start_date) < v_prev_cutoff
      and li.status = 'paid' and li.amount_paid > 0
    group by p.role
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

    'active_players_30d', jsonb_build_object(
      'current', coalesce((
        select count(distinct p.id)::int
        from profiles p
        where p.role in ('player', 'admin')
          and (
            exists (select 1 from messages m where m.sender_id = p.id and m.created_at >= now() - interval '30 days')
            or exists (select 1 from applications a where a.player_id = p.id and a.created_at >= now() - interval '30 days')
          )
      ), 0),
      'previous', coalesce((
        select count(distinct p.id)::int
        from profiles p
        where p.role in ('player', 'admin')
          and (
            exists (
              select 1 from messages m
              where m.sender_id = p.id
                and m.created_at >= now() - interval '60 days' and m.created_at < now() - interval '30 days'
            )
            or exists (
              select 1 from applications a
              where a.player_id = p.id
                and a.created_at >= now() - interval '60 days' and a.created_at < now() - interval '30 days'
            )
          )
      ), 0)
    ),

    'net_new_mrr_pence', jsonb_build_object(
      'current', (select mrr_pence from new_mrr_current) - (select mrr_pence from churned_mrr_current),
      'previous', (select mrr_pence from new_mrr_previous) - (select mrr_pence from churned_mrr_previous)
    ),

    'opportunities_posted', jsonb_build_object(
      'current', coalesce((
        select count(*)::int from opportunities where created_at >= v_month_start
      ), 0),
      'previous', coalesce((
        select count(*)::int from opportunities
        where created_at >= v_prev_month_start and created_at < v_prev_cutoff
      ), 0)
    ),

    'connections_started', jsonb_build_object(
      'current', coalesce((
        select count(*)::int from conversations where created_at >= v_month_start
      ), 0),
      'previous', coalesce((
        select count(*)::int from conversations
        where created_at >= v_prev_month_start and created_at < v_prev_cutoff
      ), 0)
    ),

    'premium_conversions', jsonb_build_object(
      'current', jsonb_build_object(
        'player', coalesce((select sum(n) from premium_conversions_current where role in ('player', 'admin')), 0),
        'coach', coalesce((select sum(n) from premium_conversions_current where role = 'coach'), 0)
      ),
      'previous', jsonb_build_object(
        'player', coalesce((select sum(n) from premium_conversions_previous where role in ('player', 'admin')), 0),
        'coach', coalesce((select sum(n) from premium_conversions_previous where role = 'coach'), 0)
      )
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_hero_stats() to service_role;
