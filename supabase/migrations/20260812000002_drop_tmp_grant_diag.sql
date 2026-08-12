-- Drops the temporary diagnostic from 20260812000001.
--
-- Result it established, recorded here so nobody has to re-run it:
--   has_column_privilege('authenticated', 'conversations',
--                        'last_message_content', 'SELECT') = TRUE
--
-- The column-level REVOKE in 20260628000001 was a no-op. Supabase's
-- table-level `grant all` to anon/authenticated still applies, and PostgreSQL
-- sums privileges rather than subtracting them — a column REVOKE cannot cut a
-- hole in a table GRANT. See 20260812000003 for the fix.

drop function if exists public.tmp_grant_diag();
