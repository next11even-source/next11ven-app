-- Corrected weekly snapshot:
--  * invoices.subscription is NULL in this sync-engine deployment, so "paying" is detected by
--    linking invoices to subscriptions via customer (i.customer = s.customer).
--    Result: 55 paying / 3 comped of 58 active — comped (100%-off) friends excluded entirely.
--  * Drops the throwaway diagnostic functions used to discover the above.

drop function if exists analytics_tmp_diag();
drop function if exists analytics_tmp_diag2();

create or replace function analytics_weekly_snapshot()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
  v_now    timestamptz := now();
  v_start  timestamptz := now() - interval '7 days';
begin
  select jsonb_build_object(

    -- ══════════════════════════════════════════════════════════════════════
    -- SECTION A — Revenue (paying subs only; 100%-comped excluded entirely).
    -- "Paying" = the subscription's customer has >= 1 paid invoice with amount_paid > 0.
    -- ══════════════════════════════════════════════════════════════════════

    'mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      where s.status = 'active'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'active_subs', coalesce((
      select count(*)::int from stripe.subscriptions s
      where s.status = 'active'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'player_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active' and p.role in ('player', 'admin')
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'coach_subs', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where s.status = 'active' and p.role = 'coach'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'coach_subs_all_time', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where p.role = 'coach'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'new_premium_player_count', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= v_start and to_timestamp(s.start_date) < v_now
        and s.status = 'active' and p.role in ('player', 'admin')
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'new_premium_player_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= v_start and to_timestamp(s.start_date) < v_now
        and s.status = 'active' and p.role in ('player', 'admin')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'new_premium_coach_count', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= v_start and to_timestamp(s.start_date) < v_now
        and s.status = 'active' and p.role = 'coach'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'new_premium_coach_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      where to_timestamp(s.start_date) >= v_start and to_timestamp(s.start_date) < v_now
        and s.status = 'active' and p.role = 'coach'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'voluntary_churn_count', coalesce((
      select count(*)::int
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status = 'canceled'
        and ps.current_period_end is not null
        and ps.current_period_end >= v_start and ps.current_period_end < v_now
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'voluntary_churn_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status = 'canceled'
        and ps.current_period_end is not null
        and ps.current_period_end >= v_start and ps.current_period_end < v_now
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'dunning_count', coalesce((
      select count(*)::int
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status in ('past_due', 'unpaid')
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'dunning_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from public.subscriptions ps
      join stripe.subscriptions s on s.id = ps.stripe_subscription_id
      where ps.status in ('past_due', 'unpaid')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'premium_players', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join stripe.subscriptions s on s.customer = p.stripe_customer_id
      where p.role in ('player', 'admin') and p.approval_status = 'approved'
        and s.status = 'active'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'actively_looking_premium', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join stripe.subscriptions s on s.customer = p.stripe_customer_id
      where p.role in ('player', 'admin') and p.approval_status = 'approved'
        and p.actively_looking = true and s.status = 'active'
        and exists (select 1 from stripe.invoices i
                    where i.customer = s.customer and i.status = 'paid' and i.amount_paid > 0)
    ), 0),

    'active_free_players', coalesce((
      select count(distinct p.id)::int
      from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role in ('player', 'admin')
        and coalesce(p.premium, false) = false
        and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now
    ), 0),

    -- ══════════════════════════════════════════════════════════════════════
    -- SECTION B — Usage & Engagement
    -- New-user metrics count by auth.users.created_at (ground truth; migrated users excluded).
    -- All weekly windows are upper-bounded (< v_now) against future-dated migrated rows.
    -- ══════════════════════════════════════════════════════════════════════

    'new_players', coalesce((
      select count(*)::int from profiles p join auth.users au on au.id = p.id
      where p.role in ('player', 'admin')
        and au.created_at >= v_start and au.created_at < v_now
    ), 0),

    'new_coaches', coalesce((
      select count(*)::int from profiles p join auth.users au on au.id = p.id
      where p.role = 'coach'
        and au.created_at >= v_start and au.created_at < v_now
    ), 0),

    'new_players_completed', coalesce((
      select count(*)::int from profiles p join auth.users au on au.id = p.id
      where p.role in ('player', 'admin')
        and au.created_at >= v_start and au.created_at < v_now
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

    'new_coaches_completed', coalesce((
      select count(*)::int from profiles p join auth.users au on au.id = p.id
      where p.role = 'coach'
        and au.created_at >= v_start and au.created_at < v_now
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

    'total_players', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'total_coaches', coalesce((
      select count(*)::int from profiles
      where approval_status = 'approved' and role = 'coach'
    ), 0),

    'wau_total', coalesce((
      select count(distinct p.id)::int from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now
    ), 0),

    'wau_players', coalesce((
      select count(distinct p.id)::int from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role in ('player', 'admin')
        and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now
    ), 0),

    'wau_coaches', coalesce((
      select count(distinct p.id)::int from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role = 'coach'
        and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now
    ), 0),

    'wau_new', coalesce((
      select count(distinct p.id)::int from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now
        and au.created_at >= v_start and au.created_at < v_now
    ), 0),

    'dau', coalesce((
      select count(distinct p.id)::int from profiles p join auth.users au on au.id = p.id
      where p.approval_status = 'approved' and p.role in ('player', 'coach', 'admin')
        and au.last_sign_in_at >= v_now - interval '1 day' and au.last_sign_in_at < v_now
    ), 0),

    'opportunities_posted', coalesce((
      select count(*)::int from opportunities
      where created_at >= v_start and created_at < v_now
    ), 0),

    'opportunities_total', coalesce((
      select count(*)::int from opportunities
    ), 0),

    'applications_submitted', coalesce((
      select count(*)::int from applications
      where created_at >= v_start and created_at < v_now
    ), 0),

    'application_response_rate_pct', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where status <> 'pending') * 100.0 / count(*))::int end
      from applications where created_at >= v_start and created_at < v_now
    ),

    'actively_looking_live', coalesce((
      select count(*)::int from profiles
      where actively_looking = true and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'total_free_agents', coalesce((
      select count(*)::int from profiles
      where status = 'free_agent' and approval_status = 'approved' and role in ('player', 'admin')
    ), 0),

    'messages_total', coalesce((
      select count(*)::int from messages where created_at >= v_start and created_at < v_now
    ), 0),

    'messages_coach_first', coalesce((
      select count(*)::int from messages m join profiles p on p.id = m.sender_id
      where m.created_at >= v_start and m.created_at < v_now and p.role = 'coach'
    ), 0),

    'messages_player_first', coalesce((
      select count(*)::int from messages m join profiles p on p.id = m.sender_id
      where m.created_at >= v_start and m.created_at < v_now and p.role in ('player', 'admin')
    ), 0),

    'first_reply_rate_pct', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where coach_replied_at is not null) * 100.0 / count(*))::int end
      from conversations
      where created_at >= v_start and created_at < v_now and initiated_by = player_id
    ),

    'median_first_reply_hours', (
      select round(percentile_cont(0.5) within group (
          order by extract(epoch from (coach_replied_at - created_at)) / 3600.0)::numeric, 1)
      from conversations
      where created_at >= v_start and created_at < v_now
        and initiated_by = player_id and coach_replied_at is not null
    ),

    'new_shortlists', coalesce((
      select count(*)::int from coach_saved_players
      where created_at >= v_start and created_at < v_now
    ), 0),

    'total_shortlisted', coalesce((
      select count(distinct player_id)::int from coach_saved_players
    ), 0),

    'profile_views_total', coalesce((
      select count(*)::int from player_views
      where viewed_at >= v_start and viewed_at < v_now
    ), 0),

    'avg_views_per_active_player', (
      select case when wau.n = 0 then null else round(pv.n::numeric / wau.n, 1) end
      from
        (select count(*)::int as n from player_views where viewed_at >= v_start and viewed_at < v_now) pv,
        (select count(distinct p.id)::int as n from profiles p join auth.users au on au.id = p.id
          where p.approval_status = 'approved' and p.role in ('player', 'admin')
            and au.last_sign_in_at >= v_start and au.last_sign_in_at < v_now) wau
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_weekly_snapshot() to service_role;
