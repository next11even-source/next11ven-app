-- trg_log_status_change (20260816000001) has been failing on EVERY status change
-- since the day it was created: status_change_log.previous_status/new_status were
-- typed as the `player_status` enum, but profiles.status is plain text. Postgres
-- does not implicitly cast text -> enum, so log_status_change()'s INSERT throws
-- "column ... is of type player_status but expression is of type text" — and
-- because the insert happens inside the same trigger/transaction as the UPDATE,
-- the whole status update rolls back. No player has been able to change their
-- status since 16 Aug 2026 (status_change_log has been empty this entire time —
-- that emptiness was mistaken for "nothing to log yet", not "every write failing").
--
-- Worse than a mismatched cast would fix: `player_status` doesn't even contain
-- two of the four real status values (loan_dual_reg, just_exploring aren't in
-- it — it's leftover from the orphaned player_profiles table, see CLAUDE.md).
-- Casting into it would still fail for those. The only correct fix is to stop
-- using that enum here — these columns should mirror profiles.status, which is
-- text.
--
-- Safe to alter in place: status_change_log has 0 rows (nothing ever committed).

alter table public.status_change_log
  alter column previous_status type text,
  alter column new_status type text;
