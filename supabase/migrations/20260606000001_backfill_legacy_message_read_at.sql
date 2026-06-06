-- Mark all messages sent before the new platform launch (20 Apr 2026) as read.
-- These were migrated from Glide and have no read tracking — treating them as
-- unread would cause the drip sequence to fire for stale legacy conversations.
update messages
set read_at = created_at
where created_at < '2026-04-20 00:00:00+00'
  and read_at is null;
