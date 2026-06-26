-- Throwaway diagnostic used to assess the created_at un-swap repair impact.
-- Superseded immediately by 20260626000006 which drops it.
create or replace function _repair_diag()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'future_rows', (select count(*) from profiles where created_at > now())
  ) into r; return r;
end $$;
grant execute on function _repair_diag() to service_role;
