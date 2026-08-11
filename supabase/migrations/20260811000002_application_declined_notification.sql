-- Split the application decision notification into accept and decline.
--
-- WHY: they were one type ('application_decision') and so shared one delivery
-- rule. They should never share one. An acceptance is the single best thing
-- that happens to a player on this platform and must arrive individually, every
-- time, by email and in-app. A decline is bad news, and a coach clearing a
-- backlog of twelve — which the nudge cron now actively pushes them to do —
-- fired twelve separate emails and twelve separate rows at whoever was in it.
--
-- Same reasoning as keeping `closed_at` out of `status`: if two events with
-- opposite meaning share a name, some surface will eventually treat them alike.
--
-- 'application_decision' now means ACCEPTED ONLY. It keeps its name because it
-- is already deployed and already written to rows in production; renaming it
-- would orphan those. 'application_declined' is the new, quieter sibling.

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
  'application_closed'
));

-- The decline email is capped at one per player per 24h, which is enforced by
-- reading this table before sending (same pattern as shortlist_availability in
-- /api/player/status-change). That read filters recipient + type + created_at.
create index if not exists notifications_recipient_type_created_idx
  on notifications (recipient_id, type, created_at desc);
