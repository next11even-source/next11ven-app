-- One-time data repair: 13 conversations.created_at/last_message_at values
-- were found exactly 365 days ahead of their own message's created_at, to
-- the second, in every case — a deterministic +365-day bug, not clock drift
-- or random corruption. Traced via the new Layer 4 event feed (16 Aug 2026);
-- searched every migration and app/lib file for the pattern and found no
-- live code path that produces it, so this looks like a one-off script run
-- directly against the database (outside this repo) rather than an ongoing
-- issue. Root cause script itself was never identified — this repairs the
-- data, it doesn't fix a cause, because there's no live cause found to fix.
--
-- Every affected conversation has exactly one message, so the correct value
-- is unambiguous: that message's created_at. Uses MIN(messages.created_at)
-- rather than hardcoding that assumption, so a conversation with more
-- messages would still repair correctly.
--
-- Idempotent: only touches conversations.created_at > now(), so it's a no-op
-- on a clean database and on any re-run. Same guard style as the earlier
-- profiles.created_at repair (20260626000007_repair_unswap_created_at.sql).

do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from conversations where created_at > now();

  update conversations c
  set created_at = m.first_message_at,
      last_message_at = m.first_message_at
  from (
    select conversation_id, min(created_at) as first_message_at
    from messages
    group by conversation_id
  ) m
  where c.id = m.conversation_id
    and c.created_at > now();

  select count(*) into v_after from conversations where created_at > now();
  raise notice 'repair_conversations_future_dates: future-dated rows % -> % (expected 0)', v_before, v_after;
end $$;
