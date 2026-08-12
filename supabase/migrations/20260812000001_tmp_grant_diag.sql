-- TEMPORARY diagnostic — dropped by the very next migration.
--
-- Question: did `revoke select (last_message_content) on conversations from
-- anon, authenticated` in 20260628000001 actually take effect? PostgreSQL
-- computes a role's privileges as the SUM of everything granted to it, and
-- Supabase issues a TABLE-level `grant all` to anon/authenticated by default.
-- A column-level REVOKE cannot subtract from a table-level GRANT, so the
-- revoke may have been a no-op — which would leave message bodies readable by
-- non-premium players via a direct PostgREST select, defeating the read
-- paywall that LockedMessageTrigger is built on.
--
-- Read-only. Executable by service_role only. No data is touched.

create or replace function public.tmp_grant_diag()
returns json
language sql
stable
security definer
as $$
  select json_build_object(
    'table_level_select', json_build_object(
      'anon',          has_table_privilege('anon',          'public.conversations', 'SELECT'),
      'authenticated', has_table_privilege('authenticated', 'public.conversations', 'SELECT')
    ),
    -- The column under investigation.
    'last_message_content', json_build_object(
      'anon',          has_column_privilege('anon',          'public.conversations', 'last_message_content', 'SELECT'),
      'authenticated', has_column_privilege('authenticated', 'public.conversations', 'last_message_content', 'SELECT')
    ),
    -- Control: a column nobody ever tried to revoke. If this reads true and
    -- last_message_content reads false, the revoke worked and the paywall holds.
    'credit_refunded_at', json_build_object(
      'anon',          has_column_privilege('anon',          'public.conversations', 'credit_refunded_at', 'SELECT'),
      'authenticated', has_column_privilege('authenticated', 'public.conversations', 'credit_refunded_at', 'SELECT')
    ),
    -- Explicit column-level grants on record, if any.
    'explicit_column_grants', coalesce((
      select json_agg(json_build_object('grantee', grantee, 'column', column_name, 'privilege', privilege_type))
      from information_schema.column_privileges
      where table_schema = 'public'
        and table_name = 'conversations'
        and column_name in ('last_message_content', 'credit_refunded_at')
        and grantee in ('anon', 'authenticated')
    ), '[]'::json)
  );
$$;

revoke all on function public.tmp_grant_diag() from public, anon, authenticated;
grant execute on function public.tmp_grant_diag() to service_role;
