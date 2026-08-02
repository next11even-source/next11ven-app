-- Throwaway diagnostic to reconcile the analytics MRR figure against the
-- founder's Stripe dashboard figure (~£311 actual vs £381.54 computed).
-- Compares each "paying" subscription's list price (unit_amount) against its
-- most recent paid invoice's actual amount_paid, to check whether partial
-- discounts (not just 100%-off comps) are in play. Dropped once resolved.

create or replace function analytics_tmp_mrr_diag()
returns jsonb
language plpgsql
security definer
set search_path = public, stripe, auth
as $$
declare r jsonb;
begin
  select jsonb_build_object(

    'mismatches', (
      select jsonb_agg(row_to_json(t))
      from (
        select
          ad.customer,
          p.full_name,
          p.role,
          ad.unit_amount_pence,
          latest_paid.amount_paid,
          latest_paid.status as latest_invoice_status,
          latest_paid.paid_count
        from (
          select distinct on (s.customer)
            s.customer,
            (s.items->'data'->0->'price'->>'unit_amount')::bigint as unit_amount_pence
          from stripe.subscriptions s
          where s.status = 'active'
          order by s.customer, s.start_date desc
        ) ad
        join profiles p on p.stripe_customer_id = ad.customer
        left join lateral (
          select i.amount_paid, i.status,
            (select count(*) from stripe.invoices i2 where i2.customer = ad.customer and i2.status='paid' and i2.amount_paid > 0) as paid_count
          from stripe.invoices i
          where i.customer = ad.customer
          order by i.period_start desc
          limit 1
        ) latest_paid on true
        where exists (select 1 from stripe.invoices i where i.customer = ad.customer and i.status='paid' and i.amount_paid > 0)
          and latest_paid.amount_paid is distinct from ad.unit_amount_pence
        order by ad.unit_amount_pence desc
      ) t
    ),

    'cancelling_paying_count', (
      select count(*)::int
      from (
        select distinct on (s.customer) s.customer, s.cancel_at_period_end,
          (s.items->'data'->0->'price'->>'unit_amount')::bigint as unit_amount_pence
        from stripe.subscriptions s
        where s.status = 'active'
        order by s.customer, s.start_date desc
      ) ad
      where ad.cancel_at_period_end = true
        and exists (select 1 from stripe.invoices i where i.customer = ad.customer and i.status='paid' and i.amount_paid > 0)
    ),

    'cancelling_paying_pence', (
      select coalesce(sum(unit_amount_pence), 0)
      from (
        select distinct on (s.customer) s.customer, s.cancel_at_period_end,
          (s.items->'data'->0->'price'->>'unit_amount')::bigint as unit_amount_pence
        from stripe.subscriptions s
        where s.status = 'active'
        order by s.customer, s.start_date desc
      ) ad
      where ad.cancel_at_period_end = true
        and exists (select 1 from stripe.invoices i where i.customer = ad.customer and i.status='paid' and i.amount_paid > 0)
    ),

    'raw_active_row_count', (select count(*)::int from stripe.subscriptions where status = 'active'),
    'deduped_active_count', (select count(distinct customer)::int from stripe.subscriptions where status = 'active')

  ) into r;
  return r;
end $$;

grant execute on function analytics_tmp_mrr_diag() to service_role;
