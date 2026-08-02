-- Refine "paying" from "has EVER had a paid invoice" to "customer's MOST
-- RECENT invoice was genuinely paid". The "ever paid" version missed accounts
-- that paid for real at some point and were later switched to comped/free
-- (e.g. the founder's own admin account: 3 real paid invoices historically,
-- but the current invoice is £0) — those still counted toward MRR under the
-- previous migration. Also drops the throwaway diagnostic used to find this.

drop function if exists analytics_tmp_mrr_diag();

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


-- ─────────────────────────────────────────────────────────────────────────────
-- analytics_platform_stats: same latest-invoice refinement
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
      )
      select jsonb_agg(
        jsonb_build_object(
          'label',              to_char(m.month, 'Mon YY'),
          'new_signups',        coalesce(sig.n, 0),
          'new_premium',        coalesce(ns.n, 0),
          'churned',            coalesce(ch.n, 0),
          'messages',           coalesce(mg.n, 0),
          'applications',       coalesce(ap.n, 0),
          'new_mrr_pence',      coalesce(ns.mrr_pence, 0),
          'churned_mrr_pence',  coalesce(ch.mrr_pence, 0)
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
