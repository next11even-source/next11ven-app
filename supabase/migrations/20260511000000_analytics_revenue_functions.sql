-- Analytics revenue function
-- Queries stripe schema (Stripe Sync Engine) joined with profiles + auth.users
-- Called exclusively from /api/admin/revenue-stats with the service role key
--
-- NOTE: subscription_items table is empty in this sync engine deployment.
-- All price/amount data is read from the subscriptions.items JSONB column directly.

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

    -- Real MRR: read unit_amount from embedded items JSONB (subscription_items is unpopulated)
    'mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Total active subscriptions
    'active_subs', coalesce((
      select count(*)::int
      from stripe.subscriptions
      where status = 'active'
    ), 0),

    -- Cancelling: active but scheduled to cancel at period end
    'cancelling', coalesce((
      select count(*)::int
      from stripe.subscriptions
      where status = 'active'
        and cancel_at_period_end = true
    ), 0),

    -- Player premium count (joined to profiles by stripe_customer_id)
    'player_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role in ('player', 'admin')
    ), 0),

    -- Coach premium count
    'coach_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role = 'coach'
    ), 0),

    -- Player MRR slice
    'player_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role in ('player', 'admin')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Coach MRR slice
    'coach_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role = 'coach'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Price breakdown: one row per distinct price point, ordered cheapest first
    -- Shows old vs new pricing split clearly
    'price_breakdown', coalesce((
      select jsonb_agg(row_data order by unit_amount_pence asc)
      from (
        select
          s.items->'data'->0->'price'->>'id'                   as price_id,
          (s.items->'data'->0->'price'->>'unit_amount')::bigint as unit_amount_pence,
          s.items->'data'->0->'price'->>'currency'              as currency,
          count(*)::int                                          as subscriber_count,
          sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)::bigint as mrr_pence
        from stripe.subscriptions s
        where s.status = 'active'
          and s.items->'data'->0->'price'->>'unit_amount' is not null
        group by price_id, unit_amount_pence, currency
      ) row_data
    ), '[]'::jsonb),

    -- MRR trend: paid subscription invoices by month, last 6 months
    'mrr_trend', coalesce((
      select jsonb_agg(row_data order by month_start)
      from (
        select
          to_char(to_timestamp(period_start), 'Mon YY')         as label,
          date_trunc('month', to_timestamp(period_start))        as month_start,
          sum(amount_paid)                                        as value
        from stripe.invoices
        where status = 'paid'
          and subscription is not null
          and to_timestamp(period_start) >= now() - interval '6 months'
        group by label, month_start
      ) row_data
    ), '[]'::jsonb),

    -- Churn risk: active, not cancelling, not seen in 14+ days (capped at 20, UI shows 5)
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

    -- Non-converting: approved users with no active stripe subscription
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
