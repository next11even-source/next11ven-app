/**
 * When is it worth asking Stripe whether a user has a subscription we don't know
 * about?
 *
 * Almost never. The Stripe webhook is the real path to premium; /api/stripe/sync
 * exists only as a safety net for a subscription created outside it — in practice
 * a migrated Glide subscriber claiming their account after the fact. But it was
 * wired to fire from the dashboard homepages on every load for every non-premium
 * user, so the net was being cast tens of thousands of times a month to catch
 * nothing. See 20260825000001_profiles_stripe_synced_at.sql.
 *
 * This is the single rule for that decision, shared by the route (authoritative)
 * and by the dashboards (so the common case costs no function invocation at all,
 * not merely a cheap one).
 */

/** How long a "Stripe has nothing for them" answer is trusted before re-asking. */
export const STRIPE_SYNC_RECHECK_DAYS = 30

const RECHECK_MS = STRIPE_SYNC_RECHECK_DAYS * 24 * 60 * 60 * 1000

export type StripeSyncSubject = {
  premium?: boolean | null
  stripe_synced_at?: string | null
}

export function needsStripeSync(profile: StripeSyncSubject): boolean {
  // Already premium — nothing to discover.
  if (profile.premium) return false

  // Never asked.
  if (!profile.stripe_synced_at) return true

  // Unparseable timestamps re-sync rather than silently skipping forever: a bad
  // value should cost one Stripe call, not permanently strand someone on free.
  const age = Date.now() - Date.parse(profile.stripe_synced_at)
  if (!Number.isFinite(age)) return true

  return age > RECHECK_MS
}
