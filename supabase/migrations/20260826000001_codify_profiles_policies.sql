-- Bring the surviving RLS policies on public.profiles into version control.
--
-- ⚠️ INTENDED TO BE A NO-OP. It reproduces the two policies exactly as they
-- already exist in production. Nothing about who can read or write what changes.
-- The point is that, until now, NOBODY COULD READ THESE POLICIES IN THE REPO.
--
-- This is the root cause of the 25 Aug 2026 data exposure, not a footnote to it.
-- All five policies on this table were created in the Supabase dashboard during
-- the Glide era. One of them was `SELECT {public} USING (true)`, which made every
-- profile — email, phone, date_of_birth — readable by any anonymous caller for
-- months. It survived that long because `grep` over supabase/migrations/ returned
-- nothing: there was nothing to find. Code review cannot catch what is not in the
-- repository, and the only way anyone found it was by querying the live database.
-- See docs/incidents/2026-08-25-profiles-data-exposure.md.
--
-- Three policies were dropped in 20260825000002 and 20260825000006. These two are
-- what remain, and they are now here rather than only in a dashboard nobody
-- diffs. Verified against pg_policies immediately before writing this, and the
-- same query is re-run after applying to confirm the definitions are unchanged.
--
-- Drop-then-create is safe even if this somehow ran outside a transaction: the
-- intermediate state is a table with RLS on and fewer policies, which DENIES
-- access. This fails closed, never open.

alter table public.profiles enable row level security;

-- Everything a user does to their own row: read it (this is the ONLY source of
-- profile SELECT for a logged-in user since 20260825000006 — reading anyone else
-- goes through the public_profiles view), insert it, update it, delete it.
drop policy if exists "Users can upsert their own profile" on public.profiles;
create policy "Users can upsert their own profile"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ⚠️ REDUNDANT, and reproduced anyway because this migration codifies what IS,
-- not what should be — mixing a behavioural change into a "write down the current
-- state" migration is how a reviewer stops trusting the label.
--
-- It is fully subsumed by the policy above for authenticated users, and grants
-- nothing to anon: auth.uid() is NULL for an anonymous caller, so `NULL = id` is
-- NULL, never true. (Confirmed empirically during the incident — an anon PATCH
-- matched zero rows.) Note it has no WITH CHECK; for an UPDATE policy Postgres
-- then reuses the USING expression as the check, so the behaviour is identical.
--
-- ⚠️ FOLLOW-UP: it should be dropped. Not because it does anything, but because
-- a `{public}`-scoped policy on this table is precisely the shape of the one that
-- caused the incident, and the next person to read this list should not have to
-- re-derive that this one is harmless. Deliberately left for its own migration.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to public
  using (auth.uid() = id);
