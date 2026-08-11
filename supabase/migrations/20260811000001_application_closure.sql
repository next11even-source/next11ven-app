-- Player-side closure loop for applications.
--
-- WHY: as of 9 Aug 2026, 111 of 168 applications (66%) had never been answered
-- and 76 had been sitting over a month. On the player's side every one of those
-- rendered as an amber "Pending" chip, which implies a queue that is moving.
-- There was no queue. An application could stay in limbo forever.
--
-- The rule: every application reaches a terminal state, guaranteed by the
-- platform, whether or not the coach ever acts. The coach nudge cron gets first
-- crack at producing a real answer; only after that fails do we close it on the
-- player's behalf.
--
-- Deliberately NOT modelled as a new `status` value. `status` belongs to the
-- coach — it records what the coach decided. Closure is something the platform
-- did because the coach decided nothing, and conflating the two would let a
-- system action masquerade as a rejection in every count and analytic that
-- already reads `status`.

alter table applications
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text;

alter table applications
  drop constraint if exists applications_close_reason_check;

alter table applications
  add constraint applications_close_reason_check check (
    close_reason is null or close_reason in ('no_response', 'role_closed')
  );

comment on column applications.closed_at is
  'Set by /api/cron/application-close when the platform resolved this application on the player''s behalf. Never set by a coach action — an accept/reject leaves this null and moves `status` instead.';

comment on column applications.close_reason is
  'no_response = coach never answered within the closure window. role_closed = the opportunity was deactivated with the application still outstanding.';

-- The closure cron scans for outstanding applications; keep it off a seq scan
-- as the table grows.
create index if not exists applications_open_awaiting_idx
  on applications (created_at)
  where closed_at is null;

-- ── Notification types ────────────────────────────────────────────────────────
-- Players had NO in-app notification for application outcomes — accept/reject
-- only ever sent an email (sendApplicationDecisionEmail). A player who doesn't
-- open email never learned they got in.

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
  'application_closed'
));

-- ── Server-side insert path for notifications ─────────────────────────────────
-- RLS allows no client inserts (triggers only). The decision notification is
-- written from the API route under the service-role key, which bypasses RLS, so
-- no policy change is needed here.
