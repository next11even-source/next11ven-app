-- drip_jobs is a server-only table (accessed via service role in cron/API routes).
-- Enable RLS with no public policies so direct client access is blocked.
-- Service role bypasses RLS, so cron jobs are unaffected.
alter table drip_jobs enable row level security;
