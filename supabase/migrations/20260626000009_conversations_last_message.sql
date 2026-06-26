-- Denormalise the latest message preview onto conversations.
-- The inbox pages previously loaded EVERY message row (content + created_at)
-- across ALL of a user's conversations just to derive one preview line each.
-- This stamps the preview onto the conversation so the inbox needs no messages
-- join at all — major egress reduction that scales with message volume.

alter table conversations
  add column if not exists last_message_content text;

-- Backfill from the most recent message per conversation.
update conversations c
set last_message_content = m.content
from (
  select distinct on (conversation_id) conversation_id, content
  from messages
  order by conversation_id, created_at desc
) m
where m.conversation_id = c.id;

-- Keep it current: every inserted message stamps its content + time onto the
-- parent conversation. Covers all send paths (API route + RPC) in one place.
create or replace function set_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
  set last_message_content = new.content,
      last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_set_conversation_last_message on messages;
create trigger trg_set_conversation_last_message
  after insert on messages
  for each row
  execute function set_conversation_last_message();
