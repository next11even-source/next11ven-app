# 25 Aug 2026 — public.profiles data exposure

Written for whoever hits something like this next. Not a compliance document.

## What happened

While verifying an unrelated column add (`stripe_synced_at`), a routine
schema-visibility check with the **public anon key** returned a real row. Following
that up showed the anon key could read **all 956 rows of `public.profiles`**,
including `email`, `phone`, `date_of_birth`, `full_name`, `city` and
`stripe_customer_id`.

The anon key is public by design — it was found in 26 files under
`.next/static/chunks/`, so anyone could pull it out of devtools on
app.next11ven.com and read the entire user base with `curl`.

Following the same thread found a second, unrelated issue: `add_message_credits`
was `SECURITY DEFINER`, `EXECUTE`-granted to `PUBLIC`, and its entire body was

```sql
update profiles
set purchased_message_credits = purchased_message_credits + p_amount
where id = p_user_id;
```

No auth check. Anyone could mint unlimited paid message credits for any account.
Eight `analytics_*` functions were likewise anon-callable and returned MRR,
revenue and conversion rates.

## Root causes

**1. The database config was never in version control.** All five RLS policies on
`profiles`, and the function `EXECUTE` grants, were created in the Supabase
dashboard during the Glide era. `grep` over `supabase/migrations/` found nothing,
because there was nothing to find. Reading the repo could not have caught either
bug — only querying the live database did.

**2. One permissive policy silently defeated four correct ones.** RLS was enabled
on `profiles` the whole time. But sitting alongside three properly-scoped policies
was:

```
"Public profiles visible to all"   SELECT   {public}   USING (true)
```

Postgres ORs permissive policies together. `USING (true)` for `public` — which
includes `anon` — grants every row to everyone, whatever else is defined.

## The lesson worth keeping: privileges SUM, they never subtract

This bit us **three times in one day**, each time in a different disguise, and
once before that in `20260812000003`:

| # | Disguise | The no-op that looked like a fix |
|---|---|---|
| 0 | `conversations` column grants (Aug 12, earlier incident) | `revoke select (col)` couldn't subtract from a table-level `GRANT` |
| 1 | `profiles` RLS | A narrow policy can't subtract from a `USING (true)` one beside it |
| 2 | Function `EXECUTE` | `revoke ... from anon` can't subtract a grant held via `PUBLIC` (`=X/postgres` in `proacl`) |
| 3 | The `public_profiles` view | `grant ... to authenticated` restricted nothing — Supabase's `ALTER DEFAULT PRIVILEGES` had already granted `anon` SELECT on the new object |

**#3 is the one to internalise.** It happened *while fixing #1*, in the code
written to fix it. The view was created, granted to `authenticated`, and was
immediately readable by `anon` — all 956 rows public again in a new shape. It was
caught only because the view was tested as `anon` after creating it, rather than
reasoned about.

So: **after any change to a grant, policy or new object, test as `anon`. Every
time. Do not reason about it — run it.** The grant list you wrote is not the whole
story; the pre-existing broad grant is invisible unless you look for it.

## How to actually check (Docker and psql are NOT installed here)

`supabase db dump` and `--local` both need Docker and will fail. `--linked` works,
via the Management API:

```bash
npx supabase db advisors --linked --type security   # found issue #2 unprompted
npx supabase db query --linked "select * from pg_policies where tablename='profiles'"
npx supabase db query --linked "select proname, proacl from pg_proc ..."  # =X/postgres means PUBLIC
```

Simulate a role in a rolled-back transaction — this is the decisive test:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"<uuid>"}';
select count(*) from public.profiles;
rollback;
```

Probe over real HTTP with the anon key from `.env.local`. Report **counts and
field presence only, never values** — you are testing exposure, not reading
people's data. To probe writes, use a filter matching zero rows; but note a `204`
there is **ambiguous**, it means RLS filtered to nothing, not that the write was
authorised. Confirm write access by reading the function/policy source instead.

## What was changed

| Migration | Effect | Applied |
|---|---|---|
| `...0002` | Drop `"Public profiles visible to all"`. anon 956 → 0 rows | ✅ |
| `...0003` | `REVOKE ... FROM PUBLIC` on 14 SECURITY DEFINER RPCs | ✅ |
| `...0004` | Create `public_profiles` view (safe columns + computed `age`) | ✅ |
| `...0005` | Re-apply the anon revokes the default privileges had undone | ✅ |
| `...0006` | Narrow `profiles` to own-row — **the actual cross-user fix** | ✅ |

## Closed — final verified state (26 Aug 2026)

Applied after the code was live in production and browse/profiles were checked
by hand there, not just on preview.

| Actor | `profiles` | `public_profiles` | Privileged RPCs |
|---|---|---|---|
| anon (key ships in the browser bundle) | **0 rows** (was 956) | 401 denied | 404 / 401 denied |
| logged-in member | **1 row — their own**, all 61 cols (was 956) | 957 rows, safe columns only | service-role only |

`email`, `phone`, `date_of_birth`, `stripe_customer_id`, `gdpr_consent`,
`approval_status` and `password_set_at` are confirmed absent from the view.

Two policies survive on the table, both `auth.uid() = id`:
`"Users can upsert their own profile"` (ALL) and `"Users can update own profile"`
(UPDATE). Nothing grants a cross-user read of the table to anyone.

Deploy ordering is **not** uniform and that is the easiest way to get this wrong:
`...0001` had to precede its code; `...0006` must follow it. Re-read the note in
each migration rather than working from the habit of the last one.

## Follow-ups

- **`date_of_birth` data quality.** Not security, but surfaced by this work: the
  earliest DOB on file is `0008-08-26` and 3 rows are absurdly old, so ages
  compute as implausible (max 2017) in front of users. Worth cleaning up in a
  table already treated as GDPR-sensitive.
- **The 11 SECURITY DEFINER trigger functions** the advisor still flags are
  untidy but unreachable — they return type `trigger` and Postgres refuses direct
  invocation. Left alone deliberately.
- **Codify the policies.** `profiles`' remaining policies still exist only in the
  dashboard. They should be written into a migration so the next person can read
  them in the repo.
