-- Message credit refund — give the credit back when a coach never replies.
--
-- WHY: a player pays £6.99/mo and gets 3 outreach credits. Spending one on a
-- coach who never replies is the single worst moment in the product: they paid,
-- they reached out, and they got nothing — no answer, no credit, no recourse.
-- That is the moment a subscription gets cancelled.
--
-- Refunding the credit turns it into the opposite. It costs the platform close
-- to nothing (quota goes largely unused) and it says the thing the player needs
-- to hear: you pay for a conversation, not for the privilege of being ignored.
--
-- Same doctrine as application closure: silence is not the player's fault, so
-- the platform resolves it on their behalf rather than leaving them holding it.

-- 1. The refund ledger. One credit per conversation, ever — this column is what
--    makes the cron idempotent. Nulled again when the RPC lets a player
--    re-approach the same coach after the 3-month cooldown, because that
--    re-approach spends a fresh credit and so earns a fresh refund.
alter table conversations
  add column if not exists credit_refunded_at timestamptz;

-- 2. The cron scans for old, unanswered, unrefunded threads. Partial index
--    keeps that scan off the (large, growing) replied-to majority.
create index if not exists conversations_refund_scan_idx
  on conversations (created_at)
  where coach_replied_at is null and credit_refunded_at is null;

-- 3. New notification type. In-app only — see the route for why this never
--    emails or texts.
alter table notifications drop constraint if exists notifications_type_check;

alter table notifications add constraint notifications_type_check check (type in (
  'post_like',
  'post_comment',
  'post_interest',
  'profile_view',
  'new_opportunity',
  'new_opportunity_application',
  'shortlist_post',
  'shortlist_availability',
  'shortlisted',
  'application_decision',
  'application_declined',
  'application_closed',
  'message_credit_refunded'
));

-- 4. Re-approach after cooldown resets the refund ledger.
--    Identical to 20260508000000 except for the one added line in the reset
--    branch (credit_refunded_at = null). Repeated in full because the RPC is
--    replaced wholesale, not patched.
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

    -- Player initiated, no coach reply → enforce 3-month cooldown.
    -- NOTE: the credit refund (14 days) and this cooldown (3 months) are
    -- deliberately different clocks. The credit comes back quickly so the
    -- player can spend it on someone ELSE; the door to THIS coach stays shut
    -- for a while longer, because re-approaching a coach who ignored you is
    -- the one thing that would make the refund a spam engine.
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
    -- Re-approach after cooldown expired: reset reply tracking, credit has been
    -- spent. credit_refunded_at resets too — a second silence earns a second
    -- refund, otherwise the guarantee quietly stops applying to anyone who ever
    -- tried the same coach twice.
    update conversations
    set initiated_by = p_player_id,
        coach_replied_at = null,
        credit_refunded_at = null,
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
