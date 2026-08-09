-- Coach engagement leaderboard for the admin analytics page.
--
-- Purpose: find the coaches worth asking for a testimonial. "Most active" on
-- its own is a vanity ranking — a coach who clicked around a lot has nothing
-- to say. What makes a quotable testimonial is PROOF OF VALUE: they reached
-- players, players replied, and ideally an application got accepted. So the
-- score weights outcomes far above raw activity, and every raw signal is
-- returned alongside it so the ranking can be sanity-checked by eye.
--
-- Recency is deliberately NOT baked into the score — a coach who got real
-- value six months ago is still a great testimonial. last_sign_in_at is
-- returned so the UI can show how warm the relationship is.

create or replace function analytics_coach_leaderboard()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  with coach as (
    select
      p.id, p.full_name, p.club, p.email, p.phone, p.avatar_url,
      p.is_agent, p.premium, p.coaching_role, p.coaching_level, p.created_at,
      au.last_sign_in_at
    from profiles p
    join auth.users au on au.id = p.id
    where p.role = 'coach'
      and p.approval_status = 'approved'
  ),

  -- Conversations the coach is part of, plus how many earned a player reply.
  -- A reply is the single strongest signal the product worked for them.
  conv as (
    select
      c.coach_id,
      count(*)::int as conversations,
      count(*) filter (
        where exists (
          select 1 from messages m
          where m.conversation_id = c.id and m.sender_id = c.player_id
        )
      )::int as conversations_with_reply,
      count(distinct c.player_id)::int as players_contacted
    from conversations c
    group by c.coach_id
  ),

  msg as (
    select
      c.coach_id,
      count(*)::int as messages_sent,
      count(*) filter (where m.created_at >= now() - interval '30 days')::int as messages_sent_30d,
      max(m.created_at) as last_message_at
    from messages m
    join conversations c on c.id = m.conversation_id
    where m.sender_id = c.coach_id
    group by c.coach_id
  ),

  short as (
    select
      coach_id,
      count(*)::int as shortlisted,
      count(*) filter (where created_at >= now() - interval '30 days')::int as shortlisted_30d
    from coach_saved_players
    group by coach_id
  ),

  opps as (
    select
      coach_id,
      count(*)::int as opportunities_posted,
      count(*) filter (where is_active)::int as opportunities_active
    from opportunities
    group by coach_id
  ),

  -- Applications land against the coach who posted the role.
  apps as (
    select
      o.coach_id,
      count(*)::int as applications_received,
      count(*) filter (where a.status = 'accepted')::int as applications_accepted,
      count(*) filter (where a.status <> 'pending')::int as applications_actioned
    from applications a
    join opportunities o on o.id = a.opportunity_id
    group by o.coach_id
  ),

  views as (
    select
      viewer_id as coach_id,
      count(*)::int as player_views,
      count(*) filter (where viewed_at >= now() - interval '30 days')::int as player_views_30d
    from player_views
    where viewer_role = 'coach'
    group by viewer_id
  ),

  scored as (
    select
      c.*,
      coalesce(cv.conversations, 0) as conversations,
      coalesce(cv.conversations_with_reply, 0) as conversations_with_reply,
      coalesce(cv.players_contacted, 0) as players_contacted,
      coalesce(mg.messages_sent, 0) as messages_sent,
      coalesce(mg.messages_sent_30d, 0) as messages_sent_30d,
      mg.last_message_at,
      coalesce(sh.shortlisted, 0) as shortlisted,
      coalesce(sh.shortlisted_30d, 0) as shortlisted_30d,
      coalesce(op.opportunities_posted, 0) as opportunities_posted,
      coalesce(op.opportunities_active, 0) as opportunities_active,
      coalesce(ap.applications_received, 0) as applications_received,
      coalesce(ap.applications_accepted, 0) as applications_accepted,
      coalesce(ap.applications_actioned, 0) as applications_actioned,
      coalesce(vw.player_views, 0) as player_views,
      coalesce(vw.player_views_30d, 0) as player_views_30d,
      -- Outcome-weighted score. Profile views are capped at 60 so a coach who
      -- only browsed can never out-rank one who actually got a reply.
      (
        coalesce(ap.applications_accepted, 0) * 15
        + coalesce(cv.conversations_with_reply, 0) * 10
        + coalesce(cv.conversations, 0) * 4
        + coalesce(op.opportunities_posted, 0) * 3
        + coalesce(ap.applications_actioned, 0) * 2
        + coalesce(sh.shortlisted, 0) * 2
        + coalesce(mg.messages_sent, 0) * 1
        + least(coalesce(vw.player_views, 0), 60) / 2
      )::int as score
    from coach c
    left join conv cv on cv.coach_id = c.id
    left join msg  mg on mg.coach_id = c.id
    left join short sh on sh.coach_id = c.id
    left join opps op on op.coach_id = c.id
    left join apps ap on ap.coach_id = c.id
    left join views vw on vw.coach_id = c.id
  )

  select jsonb_build_object(
    'total_coaches', (select count(*)::int from coach),
    'engaged_coaches', (select count(*)::int from scored where score > 0),
    -- Testimonial-ready = they have something real to talk about.
    'proof_of_value_coaches', (
      select count(*)::int from scored
      where applications_accepted > 0 or conversations_with_reply > 0
    ),
    'active_30d', (
      select count(*)::int from scored
      where last_sign_in_at >= now() - interval '30 days'
    ),
    'coaches', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          id, full_name, club, email, phone, avatar_url,
          is_agent, premium, coaching_role, coaching_level,
          created_at, last_sign_in_at, last_message_at,
          score, conversations, conversations_with_reply, players_contacted,
          messages_sent, messages_sent_30d, shortlisted, shortlisted_30d,
          opportunities_posted, opportunities_active,
          applications_received, applications_accepted, applications_actioned,
          player_views, player_views_30d
        from scored
        where score > 0
        order by score desc, conversations_with_reply desc, last_sign_in_at desc nulls last
        limit 40
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_coach_leaderboard() to authenticated, service_role;
