# Optional data repair — corrupted profiles.created_at

## Problem
~668 users were imported from Glide on 2026-04-19. For 61 of them the original signup
date in `profiles.created_at` was stored with **month and day swapped** (e.g. an
11 March signup stored as `2026-12-11`-style values), producing **future-dated** rows.

These polluted every "this week" count in the weekly report. That is now fixed at the
query layer: the report counts new signups by `auth.users.created_at` (ground truth) and
upper-bounds all weekly windows with `< now()`, so it does **not** depend on this repair.

## Scope & safety
- Only the 61 rows with `created_at > now()` are touched.
- Verified: all 61 un-swap to valid pre-migration dates; none have day > 12 (so the swap
  is unambiguous for every affected row).
- Rows that were corrupted but happen to land in the past (both month & day <= 12) are
  **undetectable** and are intentionally left alone. This repair is therefore partial but
  safe — it never makes a correct row wrong.

## Apply (only if you want the historical dates cleaned)
Run unswap_created_at.sql against the DB (e.g. via the Supabase SQL editor). It runs in a
transaction and prints the before/after count so you can review before committing.
