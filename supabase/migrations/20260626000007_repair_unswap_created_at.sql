-- One-time data repair: un-swap month/day for future-dated profiles.created_at.
--
-- 61 users imported from Glide on 2026-04-19 had their original signup date stored with
-- month and day transposed, producing future-dated rows that polluted "this week" counts.
-- All affected rows have day <= 12 (verified), so the swap is unambiguous and always yields
-- a valid pre-migration date.
--
-- Idempotent: only touches created_at > now(), so it is a no-op on a clean database and on
-- any re-run. Never makes a correct row wrong (rows that were corrupted but landed in the
-- past with both month & day <= 12 are undetectable and intentionally left untouched).

do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from profiles where created_at > now();

  update profiles
  set created_at = make_timestamptz(
        extract(year   from created_at)::int,
        extract(day    from created_at)::int,   -- stored day  -> month
        extract(month  from created_at)::int,   -- stored month -> day
        extract(hour   from created_at)::int,
        extract(minute from created_at)::int,
        extract(second from created_at)
      )
  where created_at > now()
    and extract(day from created_at) <= 12;     -- guard: only unambiguous swaps

  select count(*) into v_after from profiles where created_at > now();
  raise notice 'unswap_created_at: future-dated rows % -> % (expected 0)', v_before, v_after;
end $$;
