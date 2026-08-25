-- Re-applies the anon revokes from 20260825000004.
--
-- That migration had already been pushed when testing as `anon` revealed the
-- view was readable by it — Supabase's ALTER DEFAULT PRIVILEGES on the public
-- schema grants SELECT on new objects to anon automatically, so the migration's
-- `grant select ... to authenticated` had restricted nothing and the view was
-- exposing all 956 rows anonymously.
--
-- The revokes were applied to production immediately as a live-hole fix, and
-- 20260825000004 has been amended so a fresh replay creates the view correctly.
-- This migration exists so the already-migrated database reaches the same state
-- through the migration history rather than through a hand-run statement — the
-- project rule is `supabase db push`, never manual SQL, and the one place that
-- rule got bent should not be the one that governs whether profile data is
-- public. Idempotent, and a no-op anywhere 20260825000004 ran in its fixed form.

revoke select on public.public_profiles from public;
revoke select on public.public_profiles from anon;

grant select on public.public_profiles to authenticated;
