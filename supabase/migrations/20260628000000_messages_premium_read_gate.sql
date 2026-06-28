-- Player-pays-only message read gate — RLS backstop for the app-layer change.
--
-- Background: reading a coach's messages is now gated on the PLAYER's OWN
-- premium (previously: player premium OR coach premium). The app already stops
-- non-premium clients from fetching message content; this policy is the hard
-- backstop so a non-premium player cannot read coach messages via a direct
-- supabase-js query either (devtools bypass).
--
-- Replaces the participant-only SELECT policy on public.messages with one that
-- additionally requires a PLAYER participant to be premium to read messages they
-- did not send. Unchanged for everyone else:
--   * coaches (either participant side) still read every message
--   * premium players still read every message
--   * every user can still read messages they sent themselves
--
-- INSERT/UPDATE policies are intentionally left as-is (sending + mark-read are
-- not content reads, and the app already hides the composer for locked players).

alter table public.messages enable row level security;

drop policy if exists "Users see messages in their conversations" on public.messages;

create policy "Users see messages in their conversations"
on public.messages
for select
using (
  -- you can always read messages you sent
  auth.uid() = sender_id
  or exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        -- coach participant: always
        c.coach_id = auth.uid()
        -- player participant: only when premium
        or (
          c.player_id = auth.uid()
          and coalesce(
            (select p.premium from public.profiles p where p.id = auth.uid()),
            false
          )
        )
      )
  )
);
