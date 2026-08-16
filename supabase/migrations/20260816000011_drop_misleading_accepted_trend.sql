-- Remove monthly_table's 'accepted' column, added moments ago in
-- 20260816000010 — caught before anyone saw it, not after. It was sourced
-- from notifications where type = 'application_decision', but that
-- notification type only started being written on 11 Aug 2026
-- (20260811000002_application_declined_notification.sql). Every month before
-- that reads 0, which looks like "nobody was accepted" when the truth is
-- "we weren't recording it yet" — the exact misleading-zero trap already
-- called out for excluding 'signed' from this same table, just missed here
-- on the first pass.
--
-- Not salvageable by switching source: applications has no accepted_at or
-- updated_at column, only created_at (submission time, not decision time) —
-- there's no reliable way to bucket historical accepts by the month they
-- were actually decided. application_response_pct is unaffected and stays:
-- it reads applications.status as of now, which has no such start-date gap.

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
  with latest_invoice as (
    select distinct on (i.customer)
      i.customer, i.status, i.amount_paid
    from stripe.invoices i
    order by i.customer, i.period_start desc
  ),
  legacy_deduped as (
    select distinct on (s.customer)
      s.customer,
      (s.items->'data'->0->'price'->>'unit_amount')::bigint as unit_amount_pence
    from stripe.subscriptions s
    join latest_invoice li on li.customer = s.customer
    where s.status = 'active'
      and s.items->'data'->0->'price'->>'unit_amount' is not null
      and li.status = 'paid' and li.amount_paid > 0
    order by s.customer, s.start_date desc
  )
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

    'weekly_active_coaches', coalesce((
      select count(distinct p.id)::int
      from profiles p
      join auth.users au on au.id = p.id
      where p.approval_status = 'approved'
        and p.role = 'coach'
        and au.last_sign_in_at >= now() - interval '7 days'
    ), 0),

    'player_premium_conversions_7d', coalesce((
      select count(distinct p.id)::int
      from stripe.subscriptions s
      join profiles p on p.stripe_customer_id = s.customer
      join latest_invoice li on li.customer = s.customer
      where p.role in ('player', 'admin')
        and s.status in ('active', 'trialing')
        and to_timestamp(s.start_date) >= now() - interval '7 days'
        and li.status = 'paid' and li.amount_paid > 0
    ), 0),

    'contacts_7d', coalesce((
      select count(*)::int from conversations
      where created_at >= now() - interval '7 days'
    ), 0),

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
          date_trunc('month', to_timestamp(s.start_date))::timestamptz as month,
          count(*)::int as n,
          sum((s.items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
        from stripe.subscriptions s
        join latest_invoice li on li.customer = s.customer
        where to_timestamp(s.start_date) >= now() - interval '6 months'
          and s.items->'data'->0->'price'->>'unit_amount' is not null
          and li.status = 'paid' and li.amount_paid > 0
        group by 1
      ),
      churned as (
        select
          date_trunc('month', to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))))::timestamptz as month,
          count(*)::int as n,
          sum((s.items->'data'->0->'price'->>'unit_amount')::bigint) as mrr_pence
        from stripe.subscriptions s
        join latest_invoice li on li.customer = s.customer
        where (s.cancel_at_period_end = true or s.status = 'canceled')
          and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
          and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= now() - interval '6 months'
          and s.items->'data'->0->'price'->>'unit_amount' is not null
          and li.status = 'paid' and li.amount_paid > 0
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
      ),
      real_revenue as (
        select
          date_trunc('month', to_timestamp(i.period_start))::timestamptz as month,
          sum(i.amount_paid)::bigint as pence
        from stripe.invoices i
        where i.status = 'paid'
          and to_timestamp(i.period_start) >= now() - interval '6 months'
        group by 1
      ),
      opps as (
        select date_trunc('month', created_at)::timestamptz as month, count(*)::int as n
        from opportunities
        where created_at >= now() - interval '6 months'
        group by 1
      ),
      convos as (
        select date_trunc('month', created_at)::timestamptz as month, count(*)::int as n
        from conversations
        where created_at >= now() - interval '6 months'
        group by 1
      ),
      app_response as (
        select
          date_trunc('month', created_at)::timestamptz as month,
          count(*)::int as total,
          count(*) filter (where status in ('accepted', 'rejected'))::int as responded
        from applications
        where created_at >= now() - interval '6 months'
        group by 1
      )
      select jsonb_agg(
        jsonb_build_object(
          'label',                     to_char(m.month, 'Mon YY'),
          'new_signups',                coalesce(sig.n, 0),
          'new_premium',                coalesce(ns.n, 0),
          'churned',                    coalesce(ch.n, 0),
          'messages',                   coalesce(mg.n, 0),
          'applications',               coalesce(ap.n, 0),
          'new_mrr_pence',              coalesce(ns.mrr_pence, 0),
          'churned_mrr_pence',          coalesce(ch.mrr_pence, 0),
          'real_revenue_pence',         coalesce(rr.pence, 0),
          'opportunities_posted',       coalesce(opp.n, 0),
          'connections_started',        coalesce(cv.n, 0),
          'application_response_pct',   case when coalesce(ar.total, 0) = 0 then null
                                         else round(ar.responded * 100.0 / ar.total)::int end
        )
        order by m.month asc
      )
      from months m
      left join signups        sig on sig.month = m.month
      left join new_subs       ns  on ns.month  = m.month
      left join churned        ch  on ch.month  = m.month
      left join msgs           mg  on mg.month  = m.month
      left join apps           ap  on ap.month  = m.month
      left join real_revenue   rr  on rr.month  = m.month
      left join opps           opp on opp.month = m.month
      left join convos         cv  on cv.month  = m.month
      left join app_response   ar  on ar.month  = m.month
    ), '[]'::jsonb),

    'new_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join latest_invoice li on li.customer = s.customer
      where to_timestamp(s.start_date) >= now() - interval '30 days'
        and s.status in ('active', 'trialing')
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and li.status = 'paid' and li.amount_paid > 0
    ), 0),

    'churned_mrr_pence', coalesce((
      select sum((s.items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions s
      join latest_invoice li on li.customer = s.customer
      where (s.cancel_at_period_end = true or s.status = 'canceled')
        and coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0)) is not null
        and to_timestamp(coalesce(nullif(s.cancel_at, 0), nullif(s.canceled_at, 0))) >= now() - interval '30 days'
        and s.items->'data'->0->'price'->>'unit_amount' is not null
        and li.status = 'paid' and li.amount_paid > 0
    ), 0),

    'legacy_count', coalesce((
      select count(*)::int from legacy_deduped where unit_amount_pence < 699
    ), 0),

    'legacy_upgrade_pence', coalesce((
      select sum(699 - unit_amount_pence) from legacy_deduped where unit_amount_pence < 699
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
