-- Repair every coach notification trigger from 20260427000002.
--
-- DIAGNOSIS (9 Aug 2026, from prod data):
--   Migration 20260427000001 created the post_like / post_comment /
--   post_interest triggers — all three have live rows (73 / 8 / 1).
--   Migration 20260427000002, the very next one, created FOUR triggers —
--   new_opportunity_application, shortlist_post, shortlist_availability (x2) —
--   and every one of them has ZERO rows in prod. 168 applications have been
--   inserted since it was recorded as applied, the most recent yesterday.
--   The only rows in `notifications` come from app-code inserts (post_* and
--   'shortlisted' from /api/coach/shortlist); not one trigger from ...002 has
--   ever produced a row.
--   Ruled out: the migration IS recorded as applied on local and remote;
--   applications.coach_id is populated on all 168 rows; the notifications
--   schema matches every insert below; the type constraint (redefined in
--   20260607000002, which did land) permits all four type values; and no later
--   migration drops any of these triggers.
--   Conclusion: ...002 was recorded as applied but its DDL never ran.
--
-- Consequence: the coach bell has never fired for an application, a shortlisted
-- player posting, or a shortlisted/viewed player becoming available. Four coach
-- re-engagement paths, all silently dead since April.
--
-- This migration is idempotent — safe whether the triggers are missing,
-- present, or present-but-disabled.
--
-- CHANGE FROM THE ORIGINAL: every function now swallows its own errors. A
-- notification must never roll back the user action that triggered it — as
-- written in April, a future tightening of the notifications type constraint
-- would have started rejecting real applications and profile updates at the door.

-- ── Trigger 1: Player applies to coach's opportunity ─────────────────────────

create or replace function notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp_title   text;
  v_player_name text;
begin
  select coalesce(title, 'an opportunity') into v_opp_title
  from opportunities where id = NEW.opportunity_id;

  select coalesce(full_name, 'A player') into v_player_name
  from profiles where id = NEW.player_id;

  insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
  values (
    NEW.coach_id, NEW.player_id, 'new_opportunity_application',
    NEW.id, 'opportunity',
    v_player_name || ' applied to your "' || v_opp_title || '" opportunity'
  );

  return NEW;
exception when others then
  raise warning 'notify_new_application failed for application %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_application on applications;
create trigger trg_notify_new_application
  after insert on applications
  for each row execute function notify_new_application();
alter table applications enable trigger trg_notify_new_application;

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
  select coalesce(full_name, 'A player') into v_player_name
  from profiles where id = NEW.author_id;

  for v_coach in
    select distinct coach_id from coach_saved_players where player_id = NEW.author_id
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id, NEW.author_id, 'shortlist_post',
      NEW.id, 'post',
      v_player_name || ' posted a new update'
    );
  end loop;

  return NEW;
exception when others then
  raise warning 'notify_shortlist_post failed for post %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_shortlist_post on posts;
create trigger trg_notify_shortlist_post
  after insert on posts
  for each row execute function notify_shortlist_post();
alter table posts enable trigger trg_notify_shortlist_post;

-- ── Trigger 3: Shortlisted player changes availability ───────────────────────

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
    select distinct coach_id from coach_saved_players where player_id = NEW.id
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id, NEW.id, 'shortlist_availability',
      NEW.id, 'profile',
      coalesce(NEW.full_name, 'A player') || ' is now ' || v_status_label
    );
  end loop;

  return NEW;
exception when others then
  raise warning 'notify_shortlist_availability failed for profile %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_shortlist_availability on profiles;
create trigger trg_notify_shortlist_availability
  after update of status on profiles
  for each row
  when (NEW.status is distinct from OLD.status)
  execute function notify_shortlist_availability();
alter table profiles enable trigger trg_notify_shortlist_availability;

-- ── Trigger 4: Previously-viewed player becomes a free agent ─────────────────
-- Coaches who viewed but did NOT shortlist — shortlisted coaches get Trigger 3.

create or replace function notify_viewed_player_free_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach record;
begin
  if NEW.role not in ('player', 'admin') then
    return NEW;
  end if;

  for v_coach in
    select distinct viewer_id as coach_id
    from player_views
    where player_id = NEW.id
      and viewer_role = 'coach'
      and viewer_id not in (
        select coach_id from coach_saved_players where player_id = NEW.id
      )
  loop
    insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
    values (
      v_coach.coach_id, NEW.id, 'shortlist_availability',
      NEW.id, 'profile',
      coalesce(NEW.full_name, 'A player') || ' is now a free agent — you viewed their profile'
    );
  end loop;

  return NEW;
exception when others then
  raise warning 'notify_viewed_player_free_agent failed for profile %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_viewed_player_free_agent on profiles;
create trigger trg_notify_viewed_player_free_agent
  after update of status on profiles
  for each row
  when (NEW.status = 'free_agent' and OLD.status is distinct from 'free_agent')
  execute function notify_viewed_player_free_agent();
alter table profiles enable trigger trg_notify_viewed_player_free_agent;
