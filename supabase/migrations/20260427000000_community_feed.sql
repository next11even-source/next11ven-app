-- Community Feed tables
-- posts, post_likes, post_comments, post_interests + RLS policies

-- Posts
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade,
  post_type text check (post_type in ('highlight', 'looking_for_club', 'season_review', 'general')),
  caption text not null,
  image_url text,
  created_at timestamptz default now(),
  is_deleted boolean default false
);

-- Likes
create table post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

-- Comments
create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  is_deleted boolean default false
);

-- Coach interest on a post
create table post_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  coach_id uuid references profiles(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, coach_id)
);

-- RLS: posts
alter table posts enable row level security;

create policy "posts_read" on posts
  for select to authenticated
  using (is_deleted = false);

create policy "posts_insert" on posts
  for insert to authenticated
  with check (author_id = auth.uid());

create policy "posts_update" on posts
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "posts_delete" on posts
  for delete to authenticated
  using (author_id = auth.uid());

-- RLS: post_likes
alter table post_likes enable row level security;

create policy "likes_read" on post_likes
  for select to authenticated
  using (true);

create policy "likes_insert" on post_likes
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "likes_delete" on post_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- RLS: post_comments
alter table post_comments enable row level security;

create policy "comments_read" on post_comments
  for select to authenticated
  using (is_deleted = false);

create policy "comments_insert" on post_comments
  for insert to authenticated
  with check (author_id = auth.uid());

create policy "comments_update" on post_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "comments_delete" on post_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- RLS: post_interests
alter table post_interests enable row level security;

create policy "interests_read" on post_interests
  for select to authenticated
  using (true);

create policy "interests_insert" on post_interests
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid()
      and role = 'coach'
    )
  );

create policy "interests_delete" on post_interests
  for delete to authenticated
  using (coach_id = auth.uid());
