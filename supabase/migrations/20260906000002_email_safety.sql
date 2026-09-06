-- Email Safety Infrastructure — Phase 2 preparation
-- Three things:
--   A. Extend drip_jobs check constraint to allow onboarding steps 10–21
--   B. Partial unique index on drip_jobs for onboarding steps (prevents duplicate rows)
--   C. feature_flags table — database-stored feature flags (toggle without redeploy)
--   D. flow_settings table — per-flow kill switches for every live cron

-- ── A. Extend drip_jobs check constraint ──────────────────────────────────────
-- Drops the existing constraint and recreates it with steps 10–21 added.
-- Steps 2/3/98/99 stay; nothing that's currently valid becomes invalid.
ALTER TABLE public.drip_jobs DROP CONSTRAINT IF EXISTS drip_jobs_sequence_step_check;
ALTER TABLE public.drip_jobs ADD CONSTRAINT drip_jobs_sequence_step_check
  CHECK (sequence_step IN (1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 20, 21, 98, 99));

-- ── B. Partial unique index for onboarding steps ──────────────────────────────
-- Only applies to steps 10–21. Steps 2/3/98/99 can legitimately repeat
-- per-user across different drip sequences and must NOT be made unique.
-- A double-approval or retried request cannot insert a duplicate onboarding row.
CREATE UNIQUE INDEX IF NOT EXISTS drip_jobs_onboarding_unique
  ON public.drip_jobs (recipient_id, sequence_step)
  WHERE sequence_step BETWEEN 10 AND 21;

-- ── C. feature_flags table ────────────────────────────────────────────────────
-- Database-stored flags — can be toggled at 11pm without a code redeploy.
-- Only service-role writes; authenticated can read; anon cannot access at all.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_id     text        PRIMARY KEY,
  enabled     boolean     NOT NULL DEFAULT true,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: native_onboarding starts FALSE (fail-safe default).
-- MailerLite covers new approvals until Phase 2 is verified live.
-- Flip to true in the Supabase dashboard to cut over; flip back to roll back.
-- The two branches are mutually exclusive by construction — only one can ever run.
INSERT INTO public.feature_flags (flag_id, enabled, description) VALUES
  ('native_onboarding', false,
   'When true: insert drip_jobs onboarding rows on approval (steps 10/13 player, 14/16 coach) and on upgrade (steps 20/21). When false: call onUserApproved (MailerLite). Mutually exclusive by construction — only one branch can ever run.')
ON CONFLICT (flag_id) DO NOTHING;

-- Grants: anon cannot access; authenticated can read; service_role (crons/routes) can write.
REVOKE ALL ON public.feature_flags FROM anon;
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

-- ── D. flow_settings table ────────────────────────────────────────────────────
-- Per-flow kill switches. Disabled = cron skips that flow on next run.
-- No redeploy needed — toggle the row in the Supabase dashboard.
CREATE TABLE IF NOT EXISTS public.flow_settings (
  flow_id     text        PRIMARY KEY,
  enabled     boolean     NOT NULL DEFAULT true,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: all currently-live flows enabled. Onboarding flows disabled (not yet live).
INSERT INTO public.flow_settings (flow_id, enabled, description) VALUES
  ('drip_day3',              true,  'Unread message reminder — Day 3 (drip step 2)'),
  ('drip_day7',              true,  'Final unread message reminder — Day 7 + SMS (drip step 3)'),
  ('winback',                true,  'Win-back email on subscription cancellation (drip step 98)'),
  ('payment_failed_followup',true,  'Payment failed follow-up 48h (drip step 99)'),
  ('weekly_digest',          true,  'Weekly player digest — Thursday 08:00 UTC'),
  ('application_nudge',      true,  'Coach application nudge — daily 10:00 UTC'),
  ('coach_recommendations',  true,  'Weekly coach recommendations — Tuesday 08:00 UTC'),
  ('coach_activation_d7',    true,  'Coach activation D7 — never-posted, 7+ days since join'),
  ('coach_activation_d21',   true,  'Coach activation D21 — still not posted, 14+ days after D7'),
  ('coach_gone_quiet_d1',    true,  'Coach gone quiet D1 — silent 28+ days'),
  ('coach_gone_quiet_d14',   true,  'Coach gone quiet D14 — still silent, 14+ days after D1'),
  -- Onboarding flows — disabled until native_onboarding flag is flipped
  ('player_onboarding_d0',   false, 'Player onboarding Day 0 (drip step 10) — disabled until Phase 2'),
  ('player_onboarding_d1',   false, 'Player onboarding Day 1 (drip step 11) — disabled until Phase 2'),
  ('player_onboarding_d3',   false, 'Player onboarding Day 3 (drip step 12) — disabled until Phase 2'),
  ('player_onboarding_d7',   false, 'Player onboarding Day 7 (drip step 13) — disabled until Phase 2'),
  ('coach_onboarding_d0',    false, 'Coach onboarding Day 0 (drip step 14) — disabled until Phase 2'),
  ('coach_onboarding_d2',    false, 'Coach onboarding Day 2 (drip step 15) — disabled until Phase 2'),
  ('coach_onboarding_d5',    false, 'Coach onboarding Day 5 (drip step 16) — disabled until Phase 2'),
  ('player_pro_welcome',     false, 'Player Pro welcome (drip step 20) — disabled until Phase 2'),
  ('coach_pro_welcome',      false, 'Coach Pro welcome (drip step 21) — disabled until Phase 2')
ON CONFLICT (flow_id) DO NOTHING;

-- Grants: anon cannot access; authenticated can read; service_role (crons/routes) can write.
REVOKE ALL ON public.flow_settings FROM anon;
GRANT SELECT ON public.flow_settings TO authenticated;
GRANT ALL ON public.flow_settings TO service_role;
