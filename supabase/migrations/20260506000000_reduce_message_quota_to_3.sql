-- Reduce player message quota from 5 to 3 per billing period
-- Players who have already used ≥ 3 this month will be blocked immediately

-- Change column default
alter table player_message_quota
  alter column messages_limit set default 3;

-- Lower the cap on all active quota rows (players already at 3+ are now blocked)
update player_message_quota
  set messages_limit = 3
  where period_end > now()
    and messages_limit = 5;

-- Update RPC function with new limit and coalesce fallbacks
create or replace function initiate_coach_conversation(
  p_player_id uuid,
  p_coach_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_conv_id uuid;
  v_messages_used int;
  v_messages_limit int;
  v_period_start timestamptz;
begin
  -- Check if conversation already exists — no quota charge for existing threads
  select id into v_conv_id
  from conversations
  where coach_id = p_coach_id and player_id = p_player_id
  limit 1;

  if found then
    select messages_used, messages_limit
    into v_messages_used, v_messages_limit
    from player_message_quota
    where player_id = p_player_id
      and period_start <= now()
      and period_end > now()
    order by period_start desc
    limit 1;

    return json_build_object(
      'conversationId', v_conv_id,
      'messagesUsed', coalesce(v_messages_used, 0),
      'messagesLimit', coalesce(v_messages_limit, 3),
      'existing', true
    );
  end if;

  -- Lock active quota row for atomic update
  select period_start, messages_used, messages_limit
  into v_period_start, v_messages_used, v_messages_limit
  from player_message_quota
  where player_id = p_player_id
    and period_start <= now()
    and period_end > now()
  order by period_start desc
  limit 1
  for update;

  if not found then
    raise exception 'QUOTA_NOT_FOUND';
  end if;

  if v_messages_used >= v_messages_limit then
    raise exception 'QUOTA_EXHAUSTED';
  end if;

  -- Create conversation
  insert into conversations (coach_id, player_id, initiated_by, last_message_at)
  values (p_coach_id, p_player_id, p_player_id, now())
  returning id into v_conv_id;

  -- Increment quota
  update player_message_quota
  set messages_used = messages_used + 1,
      updated_at = now()
  where player_id = p_player_id and period_start = v_period_start;

  return json_build_object(
    'conversationId', v_conv_id,
    'messagesUsed', v_messages_used + 1,
    'messagesLimit', v_messages_limit,
    'existing', false
  );
end;
$$;
