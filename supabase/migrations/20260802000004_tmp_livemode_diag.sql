-- Throwaway: check whether test-mode Stripe objects are mixed into the synced
-- tables alongside live-mode ones (would explain remaining MRR gap vs the
-- founder's Stripe dashboard, which defaults to live mode only). Dropped once resolved.

create or replace function analytics_tmp_livemode_diag()
returns jsonb
language plpgsql
security definer
set search_path = public, stripe, auth
as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'has_livemode_col', exists (
      select 1 from information_schema.columns
      where table_schema = 'stripe' and table_name = 'subscriptions' and column_name = 'livemode'
    ),
    'sub_cols', (select jsonb_agg(column_name order by column_name)
      from information_schema.columns where table_schema='stripe' and table_name='subscriptions')
  ) into r;
  return r;
end $$;

grant execute on function analytics_tmp_livemode_diag() to service_role;
