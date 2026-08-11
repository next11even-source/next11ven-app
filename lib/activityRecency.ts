/**
 * Activity recency — the SINGLE source of truth for how `profiles.last_active`
 * is turned into a human label. Never re-derive these thresholds inline.
 *
 * Written by lib/useActivityTouch.ts (once per user per browser per day).
 *
 * DESIGN RULE — positive tiers only. We surface "Active today / this week /
 * this month" and NOTHING beyond 30 days. Absence of a chip is not a claim;
 * "Active 3 months ago" is a claim, and it's one that tells a player not to
 * bother messaging. Never add a "last seen" tier, and never render a negative
 * ("Inactive") variant.
 */

export type ActivityTier = 'today' | 'week' | 'month'

const DAY_MS = 86400000

/** Local-midnight timestamp for a date — "today" is a calendar day, not 24h. */
function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * NOTE: `today` is resolved against the VIEWER's local calendar day, so this
 * must only be called client-side (or from an already-client-rendered tree) to
 * avoid a hydration mismatch. Every current caller is a client component.
 *
 * @param now Injectable for tests.
 */
export function getActivityTier(lastActive: string | null | undefined, now: number = Date.now()): ActivityTier | null {
  if (!lastActive) return null
  const t = new Date(lastActive).getTime()
  if (Number.isNaN(t)) return null

  // Clock skew / a future timestamp still counts as current, not invalid.
  if (t >= startOfDay(now)) return 'today'
  if (now - t < 7 * DAY_MS) return 'week'
  if (now - t < 30 * DAY_MS) return 'month'
  return null
}

export const ACTIVITY_LABELS: Record<ActivityTier, string> = {
  today: 'Active today',
  week: 'Active this week',
  month: 'Active this month',
}

export function getActivityLabel(tier: ActivityTier | null): string | null {
  return tier ? ACTIVITY_LABELS[tier] : null
}

/**
 * Binary form — used on PLAYER surfaces. A player is being evaluated by
 * coaches, so a granular "Active this month" reads as a strike against them.
 * Coaches get the granular form (a player evaluating a coach benefits from
 * knowing how recently they were around); players get present-or-absent.
 */
export function isRecentlyActive(lastActive: string | null | undefined, now: number = Date.now()): boolean {
  const tier = getActivityTier(lastActive, now)
  return tier === 'today' || tier === 'week'
}
