-- Defensive guard, NOT a fix: 13 of 997 conversations.created_at values are
-- dated up to 3.5 months in the future (found live via this feed — see chat,
-- 16 Aug 2026). Real users, not seed data, tightly clustered per coach
-- (e.g. 5 rows in 3 minutes), suggesting a bulk-contact code path writes the
-- wrong timestamp rather than random corruption. Root cause is UNRESOLVED —
-- this migration only stops those 13 rows from parking permanently at the
-- top of a "most recent" feed while that gets investigated separately.

create or replace function analytics_event_feed()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
begin
  with latest_invoice as (
    select distinct on (i.customer)
      i.customer, i.status, i.amount_paid
    from stripe.invoices i
    order by i.customer, i.period_start desc
  ),
  application_accepted as (
    select
      'application_accepted'::text as event_type,
      n.created_at as occurred_at,
      coalesce(p.full_name, 'A player') || ' was accepted for "' || coalesce(o.title, 'a role') || '"' ||
        case when o.club is not null and o.club <> '' then ' at ' || o.club else '' end as headline,
      array_remove(array[p.id, o.coach_id], null) as profile_ids
    from notifications n
    join profiles p on p.id = n.recipient_id
    left join opportunities o on o.id = n.entity_id and n.entity_type = 'opportunity'
    where n.type = 'application_decision'
      and n.created_at >= now() - interval '90 days'
      and n.created_at <= now()
  ),
  conversation_started as (
    select
      'conversation_started'::text as event_type,
      c.created_at as occurred_at,
      case when c.initiated_by = c.coach_id
        then coalesce(coach.full_name, 'A coach') || ' → ' || coalesce(player.full_name, 'a player')
        else coalesce(player.full_name, 'A player') || ' → ' || coalesce(coach.full_name, 'a coach')
      end as headline,
      array[coach.id, player.id] as profile_ids
    from conversations c
    join profiles coach on coach.id = c.coach_id
    join profiles player on player.id = c.player_id
    where c.created_at >= now() - interval '90 days'
      and c.created_at <= now()
  ),
  conversation_engaged as (
    select
      'conversation_engaged'::text as event_type,
      ranked.created_at as occurred_at,
      coalesce(coach.full_name, 'A coach') || ' ↔ ' || coalesce(player.full_name, 'a player') as headline,
      array[coach.id, player.id] as profile_ids
    from (
      select conversation_id, created_at,
        row_number() over (partition by conversation_id order by created_at) as msg_num
      from messages
    ) ranked
    join conversations c on c.id = ranked.conversation_id
    join profiles coach on coach.id = c.coach_id
    join profiles player on player.id = c.player_id
    where ranked.msg_num = 3
      and ranked.created_at >= now() - interval '90 days'
      and ranked.created_at <= now()
  ),
  player_signed as (
    select
      'player_signed'::text as event_type,
      scl.changed_at as occurred_at,
      coalesce(p.full_name, 'A player') || ' marked themselves signed' as headline,
      array[p.id] as profile_ids
    from status_change_log scl
    join profiles p on p.id = scl.player_id
    where scl.new_status = 'signed'
      and scl.changed_at >= now() - interval '90 days'
      and scl.changed_at <= now()
  ),
  premium_upgraded as (
    select
      case when p.role = 'coach' then 'coach_upgraded' else 'player_upgraded' end as event_type,
      to_timestamp(s.start_date) as occurred_at,
      coalesce(p.full_name, initcap(p.role::text)) ||
        case when p.role = 'coach' then ' upgraded to Coach Pro' else ' upgraded to Premium' end as headline,
      array[p.id] as profile_ids
    from stripe.subscriptions s
    join profiles p on p.stripe_customer_id = s.customer
    join latest_invoice li on li.customer = s.customer
    where li.status = 'paid' and li.amount_paid > 0
      and to_timestamp(s.start_date) >= now() - interval '90 days'
      and to_timestamp(s.start_date) <= now()
  ),
  all_events as (
    select * from application_accepted
    union all select * from conversation_started
    union all select * from conversation_engaged
    union all select * from player_signed
    union all select * from premium_upgraded
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', event_type,
      'occurred_at', occurred_at,
      'headline', headline,
      'profile_ids', to_jsonb(profile_ids)
    ) order by occurred_at desc
  ), '[]'::jsonb)
  into v_result
  from (select * from all_events order by occurred_at desc limit 150) capped;

  return v_result;
end;
$$;

grant execute on function analytics_event_feed() to service_role;
