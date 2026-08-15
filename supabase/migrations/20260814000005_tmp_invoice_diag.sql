-- Throwaway diagnostic: real_revenue_pence (and the existing mrr_trend it's
-- modeled on) are both returning 0 for every month even though paid invoices
-- with amount_paid > 0 are known to exist (see 20260802000002_tmp_mrr_diag).
-- Checking the actual shape/values of stripe.invoices to find the mismatch.
-- Dropped once resolved.

create or replace function analytics_tmp_invoice_diag()
returns jsonb
language plpgsql
security definer
set search_path = public, stripe, auth
as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'total_invoices', (select count(*)::int from stripe.invoices),
    'paid_count', (select count(*)::int from stripe.invoices where status = 'paid'),
    'paid_amount_gt0_count', (select count(*)::int from stripe.invoices where status = 'paid' and amount_paid > 0),
    'paid_with_sub_count', (select count(*)::int from stripe.invoices where status = 'paid' and amount_paid > 0 and subscription is not null),
    'period_start_min', (select min(period_start) from stripe.invoices where status = 'paid' and amount_paid > 0),
    'period_start_max', (select max(period_start) from stripe.invoices where status = 'paid' and amount_paid > 0),
    'period_start_as_ts_min', (select min(to_timestamp(period_start)) from stripe.invoices where status = 'paid' and amount_paid > 0),
    'period_start_as_ts_max', (select max(to_timestamp(period_start)) from stripe.invoices where status = 'paid' and amount_paid > 0),
    'now_minus_6mo', (now() - interval '6 months'),
    'sample_rows', (
      select jsonb_agg(row_to_json(t))
      from (
        select customer, status, amount_paid, subscription, period_start, to_timestamp(period_start) as period_start_ts, created
        from stripe.invoices
        where status = 'paid' and amount_paid > 0
        order by period_start desc
        limit 5
      ) t
    )
  ) into r;
  return r;
end $$;

grant execute on function analytics_tmp_invoice_diag() to service_role;
