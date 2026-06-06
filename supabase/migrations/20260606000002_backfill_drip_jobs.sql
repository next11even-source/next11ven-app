-- Backfill drip_jobs for non-premium players who received a coach message
-- between platform launch (20 Apr 2026) and today but never opened it.
-- Takes the most recent unread message per player.
-- Step 2 fires on next cron run, step 3 fires 4 days later.

insert into drip_jobs (recipient_id, message_id, sequence_step, send_at)
select
  latest.player_id as recipient_id,
  latest.message_id,
  step.sequence_step,
  case step.sequence_step
    when 2 then now()
    when 3 then now() + interval '4 days'
  end as send_at
from (
  select distinct on (c.player_id)
    c.player_id,
    m.id as message_id
  from conversations c
  join messages m on m.conversation_id = c.id
  join profiles sender    on sender.id = m.sender_id
  join profiles recipient on recipient.id = c.player_id
  where m.created_at >= '2026-04-20 00:00:00+00'
    and m.created_at < now()
    and m.read_at is null
    and m.sender_id != c.player_id
    and sender.role = 'coach'
    and recipient.premium = false
    and recipient.role in ('player', 'admin')
    and not exists (
      select 1 from drip_jobs dj where dj.recipient_id = c.player_id
    )
  order by c.player_id, m.created_at desc
) latest
cross join (values (2), (3)) as step(sequence_step);
