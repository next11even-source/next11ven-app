-- Close the last_message_content preview leak without regressing egress.
--
-- conversations.last_message_content is a denormalised copy of the latest message
-- body (added in 20260626000009 to avoid loading every message row for inbox
-- previews — a deliberate egress win). Under player-pays-only it must NOT be
-- readable by a non-premium player, but column grants can't be conditioned on
-- premium and RLS can't gate a single column.
--
-- Fix: expose the preview only through a SECURITY DEFINER RPC that returns it just
-- to those allowed to read the conversation's messages (the coach participant, or
-- a premium player participant), then revoke the direct column grant. This keeps
-- the egress optimisation (no messages join in the inbox) while closing the leak.
--
-- DEPLOY ORDER: ship the app code that no longer SELECTs last_message_content and
-- calls this RPC BEFORE running this migration. (If the migration ran first, the
-- still-live old code would error selecting a now-revoked column.)

create or replace function public.conversation_previews(conv_ids uuid[])
returns table (conversation_id uuid, last_message_content text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.last_message_content
  from conversations c
  where c.id = any(conv_ids)
    and (
      -- coach participant: always
      c.coach_id = auth.uid()
      -- player participant: only when premium
      or (
        c.player_id = auth.uid()
        and coalesce(
          (select p.premium from profiles p where p.id = auth.uid()),
          false
        )
      )
    );
$$;

revoke all on function public.conversation_previews(uuid[]) from public;
grant execute on function public.conversation_previews(uuid[]) to authenticated;

-- Withhold the raw column from all client roles. The maintaining trigger
-- (set_conversation_last_message) is SECURITY DEFINER, so writes are unaffected;
-- service-role reads (server routes) also bypass column grants.
revoke select (last_message_content) on public.conversations from anon, authenticated;
