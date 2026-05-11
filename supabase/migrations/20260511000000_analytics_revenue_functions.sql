-- Analytics revenue function
-- Queries stripe schema (Stripe Sync Engine) joined with profiles + auth.users
-- Called exclusively from /api/admin/revenue-stats with the service role key

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

    -- Real MRR: sum price * quantity across all active subscription items
    'mrr_pence', coalesce((
      select sum((si.price->>'unit_amount')::bigint * coalesce(si.quantity, 1))
      from stripe.subscriptions s
      join stripe.subscription_items si on si.subscription = s.id
      where s.status = 'active'
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
      select sum((si.price->>'unit_amount')::bigint * coalesce(si.quantity, 1))
      from stripe.subscriptions s
      join stripe.subscription_items si on si.subscription = s.id
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role in ('player', 'admin')
    ), 0),

    -- Coach MRR slice
    'coach_mrr_pence', coalesce((
      select sum((si.price->>'unit_amount')::bigint * coalesce(si.quantity, 1))
      from stripe.subscriptions s
      join stripe.subscription_items si on si.subscription = s.id
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active'
        and p.role = 'coach'
    ), 0),

    -- MRR trend: paid subscription invoices by month, last 6 months
    'mrr_trend', coalesce((
      select jsonb_agg(row_data order by month_start)
      from (
        select
          to_char(to_timestamp(period_start), 'Mon YY') as label,
          date_trunc('month', to_timestamp(period_start)) as month_start,
          sum(amount_paid) as value
        from stripe.invoices
        where status = 'paid'
          and subscription is not null
          and to_timestamp(period_start) >= now() - interval '6 months'
        group by label, month_start
      ) row_data
    ), '[]'::jsonb),

    -- Churn risk: active, not cancelling, not seen in 14+ days
    'churn_risk', coalesce((
      select jsonb_agg(row_data order by last_seen asc nulls first)
      from (
        select
          p.id,
          p.full_name,
          p.role,
          p.club,
          au.last_sign_in_at as last_seen,
          to_timestamp(s.current_period_end) as period_end
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
