create or replace function analytics_tmp_diag2()
returns jsonb language plpgsql security definer set search_path=public,stripe,auth as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'active_total', (select count(*) from stripe.subscriptions where status='active'),
    'active_with_discount', (select count(*) from stripe.subscriptions where status='active' and discount is not null),
    'discount_samples', (select jsonb_agg(d) from (
        select s.id, s.discount as discount_obj
        from stripe.subscriptions s
        where s.status='active' and s.discount is not null limit 5) d),
    -- link invoices by customer: customers whose latest paid invoice is 0
    'active_customers_zero_paid', (select count(*) from stripe.subscriptions s
        where s.status='active'
          and coalesce((select max(i.amount_paid) from stripe.invoices i
                        where i.customer = s.customer and i.status='paid'),0) = 0),
    'active_customers_pos_paid', (select count(*) from stripe.subscriptions s
        where s.status='active'
          and coalesce((select max(i.amount_paid) from stripe.invoices i
                        where i.customer = s.customer and i.status='paid'),0) > 0)
  ) into r; return r;
end $$;
grant execute on function analytics_tmp_diag2() to service_role;
