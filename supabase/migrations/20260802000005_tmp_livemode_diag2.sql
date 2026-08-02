-- Throwaway follow-up: check whether test-mode Stripe subscriptions/invoices
-- are mixed into the synced tables alongside live-mode ones. Dropped once resolved.

create or replace function analytics_tmp_livemode_diag2()
returns jsonb
language plpgsql
security definer
set search_path = public, stripe, auth
as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'active_by_livemode', (
      select jsonb_object_agg(livemode::text, n) from (
        select livemode, count(*)::int as n from stripe.subscriptions where status = 'active' group by livemode
      ) t
    ),
    'test_mode_active_pence', coalesce((
      select sum((items->'data'->0->'price'->>'unit_amount')::bigint)
      from stripe.subscriptions
      where status = 'active' and livemode = false
        and items->'data'->0->'price'->>'unit_amount' is not null
    ), 0),
    'invoices_by_livemode', (
      select jsonb_object_agg(livemode::text, n) from (
        select livemode, count(*)::int as n from stripe.invoices group by livemode
      ) t
    )
  ) into r;
  return r;
end $$;

grant execute on function analytics_tmp_livemode_diag2() to service_role;
