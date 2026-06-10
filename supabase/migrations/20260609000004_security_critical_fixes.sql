-- ── Fix 1: add_message_credits — revoke public EXECUTE ───────────────────────
-- Called exclusively from the Stripe webhook via service role key.
-- Leaving this callable by anon/authenticated lets any user credit any account.
revoke execute on function public.add_message_credits(uuid, integer) from anon, authenticated;

-- ── Fix 2: analytics functions — revoke anon + authenticated EXECUTE ──────────
-- Called exclusively from admin API routes via service role key.
-- Without this, revenue and platform stats are queryable by anyone.
revoke execute on function public.analytics_platform_stats() from anon, authenticated;
revoke execute on function public.analytics_revenue_stats() from anon, authenticated;

-- ── Fix 3: avatars bucket — drop legacy broad SELECT policy ──────────────────
-- "avatars_select" (authenticated-only) was added in a prior migration.
-- "Avatars are publicly readable" is a legacy policy that still allows listing.
drop policy if exists "Avatars are publicly readable" on storage.objects;

-- ── Fix 4: post-images bucket — restrict SELECT to authenticated users ────────
-- Direct URL access is still public (controlled by the bucket's public flag).
-- Changing the SELECT policy to authenticated blocks unauthenticated listing.
drop policy if exists "post_images_select" on storage.objects;

create policy "post_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images');
