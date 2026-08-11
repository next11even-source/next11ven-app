-- Frequency cap for the coach application-nudge cron.
--
-- The cron runs daily but must never nudge the same coach daily — a coach
-- sitting on a long backlog would get chased every morning and unsubscribe.
-- One nudge per coach per NUDGE_INTERVAL_DAYS (see the cron), tracked here.

alter table profiles
  add column if not exists last_application_nudge_at timestamptz;

comment on column profiles.last_application_nudge_at is
  'Last time /api/cron/application-nudge emailed/texted this coach about unanswered applications. Frequency cap only.';
