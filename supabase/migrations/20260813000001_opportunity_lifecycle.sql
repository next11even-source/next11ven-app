-- Stale opportunity auto-removal — the opportunity-side half of the
-- response-rate work (application-close / application-nudge already cover the
-- application side).
--
-- WHY: the application-close dry run found 81 of 85 stale applications sitting
-- on opportunities still marked is_active = true. That's not an edge case,
-- it's the default coach behaviour — they stop engaging without taking the
-- role down, and every application landing on one of those roles afterwards
-- is a player spending a premium application (or a coach's own credit) into a
-- graveyard. This closes that hole from the other end: the role itself, not
-- just the applications on it.
--
-- Two rules, both HIDE (is_active = false), never delete:
--   'stale'     — role has been live 28 days regardless of activity. A generic
--                 ceiling; nothing stays open forever.
--   'neglected' — role has an application still awaiting reply at 14 days AND
--                 the coach has never accepted or rejected anyone on it. This
--                 is the sharp case: a role with real applicants going unread.
--                 A role with zero applications is exempt from this fast track
--                 — there's nothing to neglect, only the 28-day ceiling applies.
-- See lib/opportunityLifecycle.ts for the shared rule and /api/cron/opportunity-close.

alter table opportunities
  add column if not exists auto_closed_at timestamptz,
  add column if not exists auto_close_reason text;

alter table opportunities
  drop constraint if exists opportunities_auto_close_reason_check;

alter table opportunities
  add constraint opportunities_auto_close_reason_check check (
    auto_close_reason is null or auto_close_reason in ('stale', 'neglected')
  );

comment on column opportunities.auto_closed_at is
  'Set by /api/cron/opportunity-close when the platform deactivated this role on the coach''s behalf. Null on a manual is_active toggle by the coach. Cleared when the coach reopens the role.';

comment on column opportunities.auto_close_reason is
  'stale = hit the 28-day age ceiling regardless of activity. neglected = had an unanswered application at 14 days with zero accept/reject ever on this role.';

-- The closure cron scans active roles by age; keep it off a seq scan as the
-- table grows.
create index if not exists opportunities_active_scan_idx
  on opportunities (created_at)
  where is_active = true;

-- ── Notification type ─────────────────────────────────────────────────────────
-- In-app + email (see lib/email.ts sendOpportunityAutoClosedEmail) — this one
-- gets an email unlike application_closed, because it's actionable: the coach
-- can reopen the role in one tap, where a player closing on the receiving end
-- of a silent application has nothing to do but move on.

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
  'message_credit_refunded',
  'opportunity_auto_closed'
));
