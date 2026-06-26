create or replace function analytics_tmp_diag()
returns jsonb language plpgsql security definer set search_path=public,stripe,auth as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'sub_sample', (select jsonb_agg(row_to_json(t)) from (
        select s.id, s.status, s.customer,
               (s.items->'data'->0->'price'->>'unit_amount') as unit_amount,
               (s.discount is not null) as has_discount_col
        from stripe.subscriptions s where s.status='active' limit 3) t),
    'inv_cols', (select jsonb_agg(column_name order by column_name)
        from information_schema.columns where table_schema='stripe' and table_name='invoices'),
    'inv_sample', (select jsonb_agg(row_to_json(t)) from (
        select i.id, i.subscription, i.status, i.amount_paid, i.amount_due
        from stripe.invoices i order by i.period_start desc limit 3) t),
    'sub_cols', (select jsonb_agg(column_name order by column_name)
        from information_schema.columns where table_schema='stripe' and table_name='subscriptions')
  ) into r; return r;
end $$;
grant execute on function analytics_tmp_diag() to service_role;
