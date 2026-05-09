-- Extra Messages: purchased credits that never reset, coach reply tracking, 3-month cooldown

-- 1. Purchased credits on profiles (never wipes, stacks on purchase)
alter table profiles
  add column if not exists purchased_message_credits int not null default 0;

-- 2. Track when coach first replied — null means no reply yet
alter table conversations
  add column if not exists coach_replied_at timestamptz;

-- 3. Updated initiate_coach_conversation RPC
--    Priority: period quota → purchased credits → QUOTA_EXHAUSTED
--    Cooldown: if player initiated and coach hasn't replied within 3 months, block re-initiation
create or replace function initiate_coach_conversation(
  p_player_id uuid,
  p_coach_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_conv_id              uuid;
  v_conv_initiated_by    uuid;
  v_conv_coach_replied   timestamptz;
  v_conv_created_at      timestamptz;
  v_messages_used        int;
  v_messages_limit       int;
  v_period_start         timestamptz;
  v_purchased_credits    int;
  v_use_purchased        bool := false;
  v_cooldown_until       timestamptz;
  v_is_existing          bool := false;
begin
  -- Check for existing conversation
  select id, initiated_by, coach_replied_at, created_at
  into v_conv_id, v_conv_initiated_by, v_conv_coach_replied, v_conv_created_at
  from conversations
  where coach_id = p_coach_id and player_id = p_player_id
  limit 1;

  if found then
    v_is_existing := true;

    -- Coach started this conversation → no restriction, just return it
    if v_conv_initiated_by = p_coach_id then
      select messages_used, messages_limit
      into v_messages_used, v_messages_limit
      from player_message_quota
      where player_id = p_player_id
        and period_start <= now() and period_end > now()
      order by period_start desc limit 1;
      return json_build_object(
        'conversationId', v_conv_id,
        'messagesUsed', coalesce(v_messages_used, 0),
        'messagesLimit', coalesce(v_messages_limit, 3),
        'existing', true
      );
    end if;

    -- Player initiated and coach has replied → no restriction
    if v_conv_coach_replied is not null then
      select messages_used, messages_limit
      into v_messages_used, v_messages_limit
      from player_message_quota
      where player_id = p_player_id
        and period_start <= now() and period_end > now()
      order by period_start desc limit 1;
      return json_build_object(
        'conversationId', v_conv_id,
        'messagesUsed', coalesce(v_messages_used, 0),
        'messagesLimit', coalesce(v_messages_limit, 3),
        'existing', true
      );
    end if;

    -- Player initiated, no coach reply → enforce 3-month cooldown
    v_cooldown_until := v_conv_created_at + interval '3 months';
    if now() < v_cooldown_until then
      raise exception 'COOLDOWN_ACTIVE:%', to_char(v_cooldown_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;

    -- 3 months passed, no reply → allow re-approach (costs a credit)
    -- Falls through to credit check, then resets the conversation below
  end if;

  -- ── Credit check ────────────────────────────────────────────────────────────

  -- Lock active period quota row
  select period_start, messages_used, messages_limit
  into v_period_start, v_messages_used, v_messages_limit
  from player_message_quota
  where player_id = p_player_id
    and period_start <= now() and period_end > now()
  order by period_start desc
  limit 1
  for update;

  if not found then
    raise exception 'QUOTA_NOT_FOUND';
  end if;

  if v_messages_used < v_messages_limit then
    -- Consume one period credit
    update player_message_quota
    set messages_used = messages_used + 1, updated_at = now()
    where player_id = p_player_id and period_start = v_period_start;
  else
    -- Period exhausted — try purchased credits
    select purchased_message_credits
    into v_purchased_credits
    from profiles
    where id = p_player_id
    for update;

    if coalesce(v_purchased_credits, 0) <= 0 then
      raise exception 'QUOTA_EXHAUSTED';
    end if;

    update profiles
    set purchased_message_credits = purchased_message_credits - 1
    where id = p_player_id;

    v_use_purchased := true;
  end if;

  -- ── Create or reset conversation ────────────────────────────────────────────

  if v_is_existing then
    -- Re-approach after cooldown expired: reset reply tracking, credit has been spent
    update conversations
    set initiated_by = p_player_id,
        coach_replied_at = null,
        last_message_at = now()
    where id = v_conv_id;
  else
    insert into conversations (coach_id, player_id, initiated_by, last_message_at)
    values (p_coach_id, p_player_id, p_player_id, now())
    returning id into v_conv_id;
  end if;

  return json_build_object(
    'conversationId', v_conv_id,
    'messagesUsed', case when v_use_purchased then v_messages_used else v_messages_used + 1 end,
    'messagesLimit', v_messages_limit,
    'usedPurchased', v_use_purchased,
    'existing', v_is_existing
  );
end;
$$;

-- 4. Helper RPC to safely increment purchased credits (used by webhook)
create or replace function add_message_credits(p_user_id uuid, p_amount int)
returns void
language sql
security definer
as $$
  update profiles
  set purchased_message_credits = purchased_message_credits + p_amount
  where id = p_user_id;
$$;
