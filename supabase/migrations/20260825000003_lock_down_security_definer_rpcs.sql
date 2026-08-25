-- SECURITY FIX — SECURITY DEFINER functions were callable by anyone over REST.
--
-- Found 25 Aug 2026 by `supabase db advisors --linked --type security`, run
-- immediately after closing the profiles anon-read hole (20260825000002).
--
-- Every function below is SECURITY DEFINER, meaning it runs with the DEFINER's
-- privileges and bypasses RLS entirely. PostgREST exposes every function in the
-- `public` schema at /rest/v1/rpc/<name>. So an EXECUTE grant reaching `anon` is
-- an unauthenticated call into privileged code.
--
-- ⚠️ THE WORST ONE, and the reason this is a fix and not a tidy-up:
--
--     add_message_credits(p_user_id uuid, p_amount integer)
--       update profiles
--       set purchased_message_credits = purchased_message_credits + p_amount
--       where id = p_user_id;
--
-- That is the entire body. No auth check, no caller validation, SECURITY DEFINER,
-- EXECUTE granted to PUBLIC. Anyone on the internet could POST to
-- /rest/v1/rpc/add_message_credits with any user id and any amount and mint
-- unlimited paid message credits — the thing the Extra Messages product sells.
--
-- ⚠️ This also CORRECTS the claim in 20260825000002 that "writes were never
-- exposed". Direct PATCH/DELETE on the profiles table was indeed blocked by RLS,
-- and that statement is true as far as it goes — but this RPC was an
-- unauthenticated write path into the same table, reached a different way. The
-- earlier note should be read as being about table-level access only.
--
-- The eight analytics_* functions and analytics_tracker_stats / tracker_weekly_stats
-- are a smaller but real problem: they return MRR, revenue, conversion rates and
-- the coach leaderboard. Business data rather than personal data, but there is no
-- reason for it to be world-readable.
--
-- ⚠️ REVOKING FROM `anon` ALONE WOULD HAVE BEEN A SILENT NO-OP. Checking
-- pg_proc.proacl first showed a leading `=X/postgres` entry on most of these — an
-- empty grantee means EXECUTE is granted to PUBLIC, which anon and authenticated
-- inherit. Postgres sums privileges, so a revoke aimed at a role cannot subtract
-- one held via PUBLIC. This is the identical trap documented in
-- 20260812000003 for the conversations column grants. REVOKE FROM PUBLIC is the
-- part that actually does the work; the role-level revokes clean up the explicit
-- grants that also exist on some of them.
--
-- Caller audit done before writing this — every function here is invoked ONLY
-- from a server route holding SUPABASE_SERVICE_ROLE_KEY (verified by reading the
-- client construction in each route, not just the call site), except the two at
-- the bottom which are genuinely called from the browser. service_role is
-- unaffected by these revokes and is re-granted explicitly below regardless, so
-- the grant does not depend on an inherited one surviving.
--
-- NOT COVERED, deliberately: the 11 SECURITY DEFINER *trigger* functions the
-- advisor also flags (handle_new_user, log_status_change, notify_post_like, …).
-- They return type `trigger`, and Postgres refuses to invoke such a function
-- directly — "trigger functions can only be called as triggers" — so the grant is
-- untidy but not reachable. Left alone rather than risk disturbing the triggers
-- that fire on every like, comment, application and status change for no actual
-- security gain.

-- ── Service-role only: nothing in the browser ever calls these ────────────────

revoke execute on function public.add_message_credits(uuid, integer) from public, anon, authenticated;
grant  execute on function public.add_message_credits(uuid, integer) to service_role;

revoke execute on function public.initiate_coach_conversation(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.initiate_coach_conversation(uuid, uuid) to service_role;

revoke execute on function public.analytics_coach_leaderboard() from public, anon, authenticated;
grant  execute on function public.analytics_coach_leaderboard() to service_role;

revoke execute on function public.analytics_conversion_intelligence() from public, anon, authenticated;
grant  execute on function public.analytics_conversion_intelligence() to service_role;

revoke execute on function public.analytics_event_feed(integer, integer) from public, anon, authenticated;
grant  execute on function public.analytics_event_feed(integer, integer) to service_role;

revoke execute on function public.analytics_hero_stats() from public, anon, authenticated;
grant  execute on function public.analytics_hero_stats() to service_role;

revoke execute on function public.analytics_marketplace_health() from public, anon, authenticated;
grant  execute on function public.analytics_marketplace_health() to service_role;

revoke execute on function public.analytics_platform_stats() from public, anon, authenticated;
grant  execute on function public.analytics_platform_stats() to service_role;

revoke execute on function public.analytics_revenue_stats() from public, anon, authenticated;
grant  execute on function public.analytics_revenue_stats() to service_role;

revoke execute on function public.analytics_tracker_stats() from public, anon, authenticated;
grant  execute on function public.analytics_tracker_stats() to service_role;

revoke execute on function public.analytics_weekly_snapshot() from public, anon, authenticated;
grant  execute on function public.analytics_weekly_snapshot() to service_role;

revoke execute on function public.tracker_weekly_stats() from public, anon, authenticated;
grant  execute on function public.tracker_weekly_stats() to service_role;

-- ── Called from the browser: keep `authenticated`, drop `anon` ────────────────
-- conversation_previews is the premium read gate for message bodies (see
-- 20260628000001) and public_player_performance backs the player profile page.
-- Both enforce their own checks internally against auth.uid(); an anonymous
-- caller has no business reaching either.

revoke execute on function public.conversation_previews(uuid[]) from public, anon;
grant  execute on function public.conversation_previews(uuid[]) to authenticated, service_role;

revoke execute on function public.public_player_performance(uuid) from public, anon;
grant  execute on function public.public_player_performance(uuid) to authenticated, service_role;
