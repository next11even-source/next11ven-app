-- Backfill messages_used from actual conversation history.
-- Corrects quota rows for players who initiated conversations before
-- the quota system was tracking, or whose row was created after they'd
-- already started threads this billing period.
update player_message_quota pmq
set messages_used = (
  select count(*)
  from conversations c
  where c.player_id = pmq.player_id
    and c.initiated_by = pmq.player_id
    and c.last_message_at >= pmq.period_start
    and c.last_message_at < pmq.period_end
),
updated_at = now()
where pmq.period_start <= now()
  and pmq.period_end > now();
