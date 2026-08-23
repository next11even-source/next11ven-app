-- Names have been stored as a single `full_name` since day one. That works for
-- display but not for addressing: MailerLite campaigns greet people with whatever
-- was typed at signup, so a third of the list gets "Hi Ryan Bimbi Fikula".
--
-- This adds first_name / last_name as the new source of truth and INVERTS the
-- relationship: full_name becomes a derived column maintained by a trigger.
-- Deliberate — there are 414 references to full_name across 90 files (including
-- two `full_name.ilike` search queries on the browse pages). Making the parts
-- authoritative while keeping full_name populated means every one of those read
-- sites keeps working untouched, and only the ~6 write sites need to change.
--
-- A trigger, NOT a `generated always as` column, for two reasons:
--   1. A generated column can't be added to an existing column in place — it needs
--      a drop + re-add, which risks the RLS policies and indexes that reference it.
--   2. A generated column hard-rejects writes. Anything still writing full_name
--      (the Make webhook, the admin panel, an old deploy mid-rollout) would throw
--      instead of degrading. The trigger accepts a legacy full_name write and
--      back-derives the parts from it, so nothing can desync during the transition.
--
-- Splitting rule is "first word = first name, the remainder = last name", verified
-- against all 942 live rows: 93% are exactly two words, and the rule lands correctly
-- on every particle/hyphen case in the data (Jomar / Da Silva, Bailey / De Sousa,
-- Matty / Argent - Barnes, Billy / O'carroll). The 11 single-word rows land with
-- last_name NULL, which is exactly the gate the "add your surname" modal keys off.
--
-- No case normalisation is applied. The data is already clean (zero all-lower,
-- zero all-upper rows) and naive titlecasing would turn McDonald into Mcdonald.

-- ─── Helpers ──────────────────────────────────────────────────────────────────
-- Shared by the backfill below and the trigger, so there is exactly one
-- implementation of the split and one of the join.

create or replace function public.n11_name_parts(raw text)
returns text[]
language sql
immutable
as $$
  with n as (
    select nullif(btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g')), '') as v
  )
  select case
           when v is null        then array[null, null]::text[]
           when strpos(v, ' ') = 0 then array[v, null]::text[]
           else array[split_part(v, ' ', 1), substr(v, strpos(v, ' ') + 1)]::text[]
         end
  from n;
$$;

create or replace function public.n11_name_compose(first_name text, last_name text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      coalesce(nullif(btrim(regexp_replace(coalesce(first_name, ''), '\s+', ' ', 'g')), ''), '')
      || ' ' ||
      coalesce(nullif(btrim(regexp_replace(coalesce(last_name,  ''), '\s+', ' ', 'g')), ''), '')
    ),
    ''
  );
$$;

-- ─── Columns ──────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

comment on column public.profiles.first_name is
  'Source of truth for the given name. full_name is derived from this by trg_sync_profile_name.';
comment on column public.profiles.last_name is
  'Source of truth for the family name. NULL means the user has not supplied one yet — this is the gate for the forced-surname modal.';
comment on column public.profiles.full_name is
  'DERIVED from first_name + last_name by trg_sync_profile_name. Do not write directly in new code; kept populated so existing reads and full_name.ilike searches keep working.';

-- ─── Backfill ─────────────────────────────────────────────────────────────────
-- Runs before the trigger exists, so it is a plain single-pass UPDATE.
--
-- Also rewrites full_name from the composed parts. That is whitespace-only in
-- practice (verified: the split round-trips losslessly on all 942 rows) but it
-- cleans 52 rows carrying a trailing or doubled space. Not cosmetic — a stored
-- trailing space silently breaks the exact-match lookup in
-- /api/admin/showcase-payers, which does .ilike('full_name', session.name.trim()).

update public.profiles
set first_name = (public.n11_name_parts(full_name))[1],
    last_name  = (public.n11_name_parts(full_name))[2],
    full_name  = public.n11_name_compose(
                   (public.n11_name_parts(full_name))[1],
                   (public.n11_name_parts(full_name))[2]
                 )
where first_name is null
  and last_name is null;

-- ─── Sync trigger ─────────────────────────────────────────────────────────────
-- Whichever side of the name the caller touched wins, and the other side is
-- recomputed from it. If a statement writes both, the parts win — they are the
-- new source of truth.

create or replace function public.sync_profile_name()
returns trigger
language plpgsql
as $$
declare
  parts         text[];
  parts_changed boolean;
  full_changed  boolean;
begin
  if TG_OP = 'INSERT' then
    parts_changed := NEW.first_name is not null or NEW.last_name is not null;
    full_changed  := NEW.full_name  is not null;
  else
    parts_changed := NEW.first_name is distinct from OLD.first_name
                  or NEW.last_name  is distinct from OLD.last_name;
    full_changed  := NEW.full_name  is distinct from OLD.full_name;
  end if;

  if parts_changed then
    NEW.first_name := nullif(btrim(regexp_replace(coalesce(NEW.first_name, ''), '\s+', ' ', 'g')), '');
    NEW.last_name  := nullif(btrim(regexp_replace(coalesce(NEW.last_name,  ''), '\s+', ' ', 'g')), '');
    NEW.full_name  := public.n11_name_compose(NEW.first_name, NEW.last_name);

  elsif full_changed then
    -- Legacy write path: someone set full_name directly. Derive the parts from it
    -- and normalise full_name back out of them so the three columns cannot drift.
    parts          := public.n11_name_parts(NEW.full_name);
    NEW.first_name := parts[1];
    NEW.last_name  := parts[2];
    NEW.full_name  := public.n11_name_compose(parts[1], parts[2]);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_profile_name on public.profiles;

create trigger trg_sync_profile_name
  before insert or update on public.profiles
  for each row
  execute function public.sync_profile_name();
