-- Un-swap month/day for future-dated (corrupted) profiles.created_at values.
-- Safe: only rows with created_at > now(); all such rows have day <= 12 (verified).
-- Run manually — NOT a migration. Review the RAISE NOTICE output before COMMIT.
begin;

do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from profiles where created_at > now();
  raise notice 'future-dated rows before: %', v_before;

  update profiles
  set created_at = make_timestamptz(
        extract(year   from created_at)::int,
        extract(day    from created_at)::int,   -- day  -> month
        extract(month  from created_at)::int,   -- month -> day
        extract(hour   from created_at)::int,
        extract(minute from created_at)::int,
        extract(second from created_at)
      )
  where created_at > now()
    and extract(day from created_at) <= 12;     -- guard: only unambiguous swaps

  select count(*) into v_after from profiles where created_at > now();
  raise notice 'future-dated rows after: % (expected 0)', v_after;
end $$;

-- Inspect the result, then COMMIT;  (or ROLLBACK; to abort)
commit;
