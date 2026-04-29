-- Notifications table + triggers for post_likes, post_comments, post_interests

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text check (type in (
    'post_like', 'post_comment', 'post_interest',
    'profile_view', 'new_opportunity'
  )),
  entity_id uuid,
  entity_type text check (entity_type in ('post', 'opportunity', 'profile')),
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- RLS: users read only their own notifications; no client inserts (triggers only)
alter table notifications enable row level security;

create policy "notifications_read_own" on notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy "notifications_update_own" on notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ── Trigger: post liked ───────────────────────────────────────────────────────

create or replace function notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_actor_name text;
begin
  select author_id into v_author_id
  from posts where id = NEW.post_id;

  -- skip self-like
  if NEW.user_id = v_author_id then
    return NEW;
  end if;

  select coalesce(full_name, 'Someone') into v_actor_name
  from profiles where id = NEW.user_id;

  insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
  values (
    v_author_id,
    NEW.user_id,
    'post_like',
    NEW.post_id,
    'post',
    v_actor_name || ' liked your post'
  );

  return NEW;
end;
$$;

create trigger trg_notify_post_like
  after insert on post_likes
  for each row execute function notify_post_like();

-- ── Trigger: post commented ───────────────────────────────────────────────────

create or replace function notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_actor_name text;
begin
  select author_id into v_author_id
  from posts where id = NEW.post_id;

  -- skip self-comment
  if NEW.author_id = v_author_id then
    return NEW;
  end if;

  select coalesce(full_name, 'Someone') into v_actor_name
  from profiles where id = NEW.author_id;

  insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
  values (
    v_author_id,
    NEW.author_id,
    'post_comment',
    NEW.post_id,
    'post',
    v_actor_name || ' commented on your post'
  );

  return NEW;
end;
$$;

create trigger trg_notify_post_comment
  after insert on post_comments
  for each row execute function notify_post_comment();

-- ── Trigger: coach expressed interest ────────────────────────────────────────

create or replace function notify_post_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (recipient_id, actor_id, type, entity_id, entity_type, message)
  values (
    NEW.player_id,
    NEW.coach_id,
    'post_interest',
    NEW.post_id,
    'post',
    'A coach is interested in you — upgrade to see who'
  );

  return NEW;
end;
$$;

create trigger trg_notify_post_interest
  after insert on post_interests
  for each row execute function notify_post_interest();
