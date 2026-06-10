-- Remove old overly-permissive player_views policies.
-- "Anyone can log a view" had with_check = true (always true — the warning source).
-- The other two are redundant now that player_views_select and player_views_insert exist.

drop policy if exists "Anyone can log a view" on player_views;
drop policy if exists "authenticated can insert view" on player_views;
drop policy if exists "player can read own views" on player_views;
