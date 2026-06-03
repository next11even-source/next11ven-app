-- Add pending_approvals count and applications column to monthly table in analytics_platform_stats()

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

    -- Monthly active users: approved users signed in last 30 days
    'mau', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '30 days'
    ), 0),

    -- Previous period MAU (31-60 days ago) for trend arrow
    'mau_prev', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= now() - interval '60 days'
        and au.last_sign_in_at < now() - interval '30 days'
    ), 0),

    -- Marketplace: approved player and coach counts for ratio
    'player_count', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'coach_count', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role = 'coach'
    ), 0),

    -- Reply rate: % of player-initiated convos where coach replied (last 90 days)
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

    -- Live opportunities posted
    'open_opportunities', coalesce((
      select count(*)::int from opportunities
    ), 0),

    -- Pending approvals: users awaiting admin review right now
    'pending_approvals', coalesce((
      select count(*)::int from profiles
      where approval_status = 'pending'
        and role in ('player', 'coach')
    ), 0),

    -- Engagement funnel: registered → approved → active 30d → premium
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

    -- Month-by-month table: last 6 months
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

    -- Net MRR movement: new subscriptions started this calendar month
    'new_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where to_timestamp(s.start_date) >= date_trunc('month', now())
        and s.status in ('active', 'trialing')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Churned MRR: subscriptions ending this calendar month
    'churned_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where (s.cancel_at_period_end = true or s.status = 'canceled')
        and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
        and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= date_trunc('month', now())
        and s.items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),

    -- Legacy pricing opportunity
    'legacy_count', coalesce((
      select count(*)::int
      from stripe.subscriptions s
      where s.status = 'active'
        and (s.items->'data'->0->'price'->>'unit_amount')::bigint < 699
    ), 0),

    'legacy_upgrade_pence', coalesce((
      select sum(699 - (s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and (s.items->'data'->0->'price'->>'unit_amount')::bigint < 699
    ), 0)

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_platform_stats() to service_role;
