-- Actually withhold conversations.last_message_content from client roles.
--
-- 20260628000001 tried this with `revoke select (last_message_content) ... from
-- anon, authenticated` and it silently did nothing. PostgreSQL computes a
-- role's access as the SUM of every grant it holds; Supabase issues a
-- TABLE-level grant to anon/authenticated, and a column-level REVOKE cannot
-- subtract from a table-level GRANT. No error was raised, so it looked applied.
-- Verified 12 Aug 2026: has_column_privilege('authenticated', 'conversations',
-- 'last_message_content', 'SELECT') was TRUE.
--
-- Impact until now: conversations RLS lets a player read their own rows, so a
-- NON-PREMIUM player could select last_message_content directly and read the
-- newest message body in every one of their threads — exactly the content
-- LockedMessageTrigger replaces with a synthetic blur, and a core part of what
-- Player Premium sells. Full thread history was never exposed; the RLS policy
-- on public.messages (20260628000000) is correct and unchanged.
--
-- The only mechanism Postgres honours here is to drop the table-level grant and
-- re-grant an explicit column list.
--
-- ⚠️ CONSEQUENCE FOR EVERY FUTURE MIGRATION ON THIS TABLE:
-- conversations no longer has a blanket SELECT grant, so a newly added column
-- is NOT readable by clients until it is granted. Symptom: PostgREST 403
-- "permission denied for column" and an inbox that won't load. Any migration
-- adding a column here must follow it with:
--     grant select (new_column) on public.conversations to anon, authenticated;
-- (Or re-run this block, which rebuilds the list from whatever exists.)
-- Reads of the body itself go through conversation_previews() — a security
-- definer RPC that enforces the premium check — so it is unaffected by this.

revoke select on public.conversations from anon, authenticated;

-- Built dynamically rather than typed out: a hand-written list is one forgotten
-- column away from breaking the inbox, and this table has gained two columns
-- in the last three months.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'conversations'
    and column_name <> 'last_message_content';

  execute format(
    'grant select (%s) on public.conversations to anon, authenticated',
    cols
  );
end $$;

-- Fail the migration rather than deploy a paywall that is still open.
do $$
begin
  if has_column_privilege('authenticated', 'public.conversations', 'last_message_content', 'SELECT') then
    raise exception 'last_message_content is STILL selectable by authenticated — grant fix did not take';
  end if;
  if not has_column_privilege('authenticated', 'public.conversations', 'id', 'SELECT') then
    raise exception 'authenticated lost SELECT on conversations.id — the re-grant did not cover the table';
  end if;
end $$;
