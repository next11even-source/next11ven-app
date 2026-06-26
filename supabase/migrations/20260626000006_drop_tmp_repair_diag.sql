-- Drop the throwaway repair diagnostic function. Impact analysis was done in the app layer:
-- all 61 future-dated profiles (corrupted Glide-migration created_at, month/day swapped)
-- un-swap cleanly to valid pre-migration dates. The optional un-swap repair is documented
-- in supabase/repair/ and is NOT auto-applied.
drop function if exists _repair_diag();
