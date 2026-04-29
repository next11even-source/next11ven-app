-- Coach notification triggers
-- Tables confirmed: applications (id, player_id, coach_id, opportunity_id)
--                  player_views (player_id, viewer_id, viewer_role, viewed_at)
--                  coach_saved_players (coach_id, player_id)
--                  profiles trigger rows expose NEW.full_name, NEW.status, NEW.role directly

-- ── Extend type + entity_type constraints ─────────────────────────────────────

alter table notifications
  drop constraint if exists notifications_type_check;

alter table notifications
  add constraint notifications_type_check check (type in (
    'post_like', 'post_comment', 'post_interest',
    'profile_view', 'new_opportunity',
    'new_opportunity_application',
    'shortlist_post',
    'shortlist_availability'
  ));

-- entity_type already covers 'post', 'opportunity', 'profile' — no change needed

-- ── Trigger 1: Player applies to coach's opportunity ─────────────────────────

create or replace function notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_title  text;
  v_player_name text;
begin
  select coalesce(title, 'an opportunity') into v_opp_title
  from opportunities where id = NEW.opportunity_id;

  select coalesce(full_name, 'A player') into v_player_name
  from profiles where id = NEW.player_id;

  -- coach_id is denormalised onto applications at insert time
  insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
  values (
    NEW.coach_id,
    NEW.player_id,
    'new_opportunity_application',
    NEW.id,
    'opportunity',
    v_player_name || ' applied to your "' || v_opp_title || '" opportunity'
  );

  return NEW;
end;
$$;

create trigger trg_notify_new_application
  after insert on applications
  for each row execute function notify_new_application();

-- ── Trigger 2: Shortlisted player creates a post ─────────────────────────────

create or replace function notify_shortlist_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_name text;
  v_coach       record;
begin
  -- Coaches won't appear in coach_saved_players as players, so no role check needed
  select coalesce(full_name, 'A player') into v_player_name
  from profiles where id = NEW.author_id;

  for v_coach in
    select distinct coach_id
    from coach_saved_players
    where player_id = NEW.author_id
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id,
      NEW.author_id,
      'shortlist_post',
      NEW.id,
      'post',
      v_player_name || ' posted a new update'
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_notify_shortlist_post
  after insert on posts
  for each row execute function notify_shortlist_post();

-- ── Trigger 3: Shortlisted player changes availability ────────────────────────
-- Uses WHEN clause so the function only fires on actual status changes,
-- not on every profile update.

create or replace function notify_shortlist_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_label text;
  v_coach        record;
begin
  -- Only notify for player/admin roles
  if NEW.role not in ('player', 'admin') then
    return NEW;
  end if;

  v_status_label := case NEW.status
    when 'free_agent'     then 'a free agent'
    when 'signed'         then 'signed to a club'
    when 'loan_dual_reg'  then 'looking for loan / dual reg'
    when 'just_exploring' then 'just exploring options'
    else NEW.status
  end;

  for v_coach in
    select distinct coach_id
    from coach_saved_players
    where player_id = NEW.id
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id,
      NEW.id,
      'shortlist_availability',
      NEW.id,
      'profile',
      coalesce(NEW.full_name, 'A player') || ' is now ' || v_status_label
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_notify_shortlist_availability
  after update of status on profiles
  for each row
  when (NEW.status is distinct from OLD.status)
  execute function notify_shortlist_availability();

-- ── Trigger 4: Previously-viewed player becomes a free agent ─────────────────
-- Notifies coaches who viewed the player but haven't shortlisted them
-- (shortlisted coaches already get Trigger 3's notification — no duplicate).
-- Scoped to viewer_role = 'coach' so players don't receive this.

create or replace function notify_viewed_player_free_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach record;
begin
  -- Only for player/admin roles going free agent
  if NEW.role not in ('player', 'admin') then
    return NEW;
  end if;

  for v_coach in
    select distinct viewer_id as coach_id
    from player_views
    where player_id = NEW.id
      and viewer_role = 'coach'
      -- Exclude coaches who already shortlisted this player (they get Trigger 3)
      and viewer_id not in (
        select coach_id
        from coach_saved_players
        where player_id = NEW.id
      )
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id,
      NEW.id,
      'shortlist_availability',
      NEW.id,
      'profile',
      coalesce(NEW.full_name, 'A player') || ' is now a free agent — you viewed their profile'
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_notify_viewed_player_free_agent
  after update of status on profiles
  for each row
  when (NEW.status = 'free_agent' and OLD.status is distinct from 'free_agent')
  execute function notify_viewed_player_free_agent();
