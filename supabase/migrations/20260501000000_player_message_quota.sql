-- Add billing period columns to subscriptions
alter table subscriptions
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz;

-- Player message quota table
create table if not exists player_message_quota (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  messages_used int not null default 0,
  messages_limit int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_message_quota_player_period
  on player_message_quota(player_id, period_start);

alter table player_message_quota enable row level security;

create policy "Players read own quota"
  on player_message_quota for select
  to authenticated
  using (auth.uid() = player_id);

-- Atomic RPC: check quota, create conversation, increment quota in one transaction
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
      'messagesLimit', coalesce(v_messages_limit, 5),
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
