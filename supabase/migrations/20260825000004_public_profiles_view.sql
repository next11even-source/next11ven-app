-- Step 1 of 2 — ADDITIVE ONLY. Creates the safe read surface for cross-user
-- profile reads. Changes no permission and breaks nothing; the policy tightening
-- that gives it teeth is 20260825000005, which must NOT be applied until the code
-- using this view is deployed. See the ordering note at the bottom.
--
-- WHY: closing the anonymous hole (20260825000002) left the second-order problem
-- untouched — any approved logged-in member could still read every column of
-- every other member's profile, including email, phone and date_of_birth. RLS is
-- row-level and cannot express "these columns but not those", so the fix has to
-- come from somewhere else.
--
-- WHY A VIEW rather than column-level GRANTs on the table: column grants apply to
-- the ROLE, not the row, so revoking `email` from `authenticated` would also stop
-- a user reading their OWN email. That breaks 35 own-row client reads including
-- two `select('*')` calls on the profile-edit screens. Inverting it instead —
-- table access narrowed to the caller's own row (all 61 columns, so every one of
-- those 35 reads is untouched), plus this view for everyone else's — means only
-- the ~20 genuine cross-user reads need to change.
--
-- ⚠️ COLUMN RESTRICTION ONLY. This view deliberately does NOT filter rows: it is
-- `select <safe columns> from profiles` with no WHERE. Every caller already
-- applies its own `approved = true` / role / actively_looking filters, and adding
-- a second row filter here would silently change what browse lists, message
-- threads and carousels return. Same rows, fewer columns — that keeps the
-- behavioural diff of the migration as close to zero as it can be while still
-- fixing the exposure.
--
-- ⚠️ date_of_birth is replaced by a computed `age`. The only cross-user read of
-- it (app/dashboard/player/players/[id]/page.tsx) immediately does
-- `computeAge(player.date_of_birth)` and renders the number, so this is lossless
-- for the one surface that used it. It matters because non-league includes youth
-- players, and an exact date of birth for a minor is not something one member
-- should be able to read about another when the product only ever needed the age.
--
-- security_invoker is left at its default (false), so the view runs with its
-- owner's privileges and is not blocked by the own-row policy that
-- 20260825000005 puts on the underlying table. That is the entire mechanism —
-- Supabase's advisor will flag it as a security-definer view, which is correct
-- and intended here.

create or replace view public.public_profiles as
select
  -- identity
  id, full_name, first_name, last_name, avatar_url, role, is_agent,
  -- player attributes
  position, secondary_position, club, city, location, playing_level,
  foot, height, status, contract_status, actively_looking,
  -- coach attributes
  coaching_level, coaching_role, coaching_history,
  -- profile content
  bio, highlight_urls,
  -- season stats (already shown publicly on the profile page)
  goals, assists, appearances, season,
  -- tier + activity
  premium, approved, is_active, weekly_views, streak_weeks, streak_last_week,
  last_active, created_at, updated_at,
  -- showcase (rendered on the public showcase squad list)
  showcase_confirmed, showcase_waitlist, showcase_coach_waitlist,
  showcase_attended, showcase_team, showcase_squad_number,
  -- tracker consent flag, needed to decide whether to show tracked stats
  performance_stats_public,
  -- age INSTEAD OF date_of_birth — see the note above
  extract(year from age(date_of_birth))::int as age
from public.profiles;

comment on view public.public_profiles is
  'Cross-user read surface for profiles. Excludes email, phone, date_of_birth, '
  'sms_opt_in, gdpr_consent, referral, approval_status, stripe_customer_id, '
  'password_set_at, last_sms_at, purchased_message_credits, email_marketing_opt_out, '
  'performance_include_preseason, last_application_nudge_at, stripe_synced_at and the '
  'showcase_*_at timestamps. Exposes a computed age in place of date_of_birth. '
  'Read another user through this; read yourself through profiles directly.';

-- ⚠️ THE REVOKES ARE NOT OPTIONAL AND MUST COME FIRST. Supabase ships ALTER
-- DEFAULT PRIVILEGES on the public schema that grant SELECT on newly created
-- objects to anon, authenticated and service_role automatically. So a bare
-- `grant select ... to authenticated` restricts NOTHING — the view is born
-- readable by anon, which would have silently reopened the exact hole
-- 20260825000002 just closed, in a new shape. Caught here by testing as anon
-- after creating the view rather than assuming the grant list was the whole
-- story; the first version of this migration had only the grant below and anon
-- could read all 956 rows through it.
revoke select on public.public_profiles from public;
revoke select on public.public_profiles from anon;

grant select on public.public_profiles to authenticated;
-- deliberately NOT granted to anon: nothing anonymous should read profile data
-- in any shape. 20260825000002 closed that door and this must not reopen it.

-- ⚠️ DEPLOY ORDER — this one is the opposite way round to 20260825000001.
-- That migration had to run BEFORE its code (the app selected a column that had
-- to exist first). This pair must run with the code BETWEEN them:
--     1. apply this migration            (additive, no behaviour change)
--     2. deploy the app                  (cross-user reads now hit the view)
--     3. apply 20260825000005            (narrows the table to own-row)
-- Applying 5 before the code is deployed would make every browse list, carousel,
-- message thread and player profile return zero rows for everyone.
