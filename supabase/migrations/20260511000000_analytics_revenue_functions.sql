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

    -- Real MRR: sum of unit_amount across all active subscriptions
    'mrr_pence', coalesce((
      select sum((s.attrs->'items'->'data'->0->'price'->>'unit_amount')::int)
      from stripe.subscriptions s
      where s.attrs->>'status' = 'active'
    ), 0),

    -- Total active subscriptions (includes any that cancel at period end)
    'active_subs', coalesce((
      select count(*)::int
      from stripe.subscriptions
      where attrs->>'status' = 'active'
    ), 0),

    -- Cancelling: active but flagged to cancel at period end
    'cancelling', coalesce((
      select count(*)::int
      from stripe.subscriptions
      where attrs->>'status' = 'active'
        and (attrs->>'cancel_at_period_end')::boolean = true
    ), 0),

    -- Player premium count (joined to profiles by stripe_customer_id)
    'player_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.attrs->>'customer'
      where s.attrs->>'status' = 'active'
        and p.role in ('player', 'admin')
    ), 0),

    -- Coach premium count
    'coach_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.attrs->>'customer'
      where s.attrs->>'status' = 'active'
        and p.role = 'coach'
    ), 0),

    -- Player MRR slice
    'player_mrr_pence', coalesce((
      select sum((s.attrs->'items'->'data'->0->'price'->>'unit_amount')::int)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.attrs->>'customer'
      where s.attrs->>'status' = 'active'
        and p.role in ('player', 'admin')
    ), 0),

    -- Coach MRR slice
    'coach_mrr_pence', coalesce((
      select sum((s.attrs->'items'->'data'->0->'price'->>'unit_amount')::int)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.attrs->>'customer'
      where s.attrs->>'status' = 'active'
        and p.role = 'coach'
    ), 0),

    -- MRR trend: paid subscription invoices grouped by month, last 6 months
    'mrr_trend', coalesce((
      select jsonb_agg(row_data order by month_start)
      from (
        select
          to_char(to_timestamp((attrs->>'period_start')::bigint), 'Mon YY') as label,
          date_trunc('month', to_timestamp((attrs->>'period_start')::bigint)) as month_start,
          sum((attrs->>'amount_paid')::int) as value
        from stripe.invoices
        where attrs->>'status' = 'paid'
          and attrs->>'subscription' is not null
          and to_timestamp((attrs->>'period_start')::bigint) >= now() - interval '6 months'
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
          to_timestamp((s.attrs->>'current_period_end')::bigint) as period_end
        from stripe.subscriptions s
        join profiles p on p.stripe_customer_id = s.attrs->>'customer'
        join auth.users au on au.id = p.id
        where s.attrs->>'status' = 'active'
          and (s.attrs->>'cancel_at_period_end')::boolean = false
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
          where s.attrs->>'customer' = p.stripe_customer_id
            and s.attrs->>'status' = 'active'
        )
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_revenue_stats() to service_role;
