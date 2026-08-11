/**
 * Application response tracking — the SINGLE source of truth for what counts as
 * an application the coach still owes an answer on.
 *
 * WHY THIS EXISTS: a player who applies and hears nothing assumes the platform
 * is dead. Accept and reject are BOTH good outcomes; silence is the only bad
 * one. Every surface that nudges a coach must agree on the same definition, so
 * never re-derive "unactioned" inline.
 *
 * DEFINITION: awaiting reply = anything that isn't a final answer. 'shortlisted'
 * is a real action but the player still doesn't know where they stand, so it
 * counts as outstanding. Only 'accepted' and 'rejected' close the loop.
 */

export const FINAL_STATUSES = ['accepted', 'rejected'] as const

/** Statuses to filter on in a Supabase `.in()` — keep in sync with the above. */
export const AWAITING_REPLY_STATUSES = ['pending', 'viewed', 'shortlisted'] as const

export function isAwaitingReply(status: string | null | undefined): boolean {
  if (!status) return true
  return !(FINAL_STATUSES as readonly string[]).includes(status)
}

export function waitingDays(createdAt: string, now: number = Date.now()): number {
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86400000))
}

/**
 * How overdue a reply is. Deliberately blunt thresholds — a player who applied
 * a fortnight ago has already decided nobody read it.
 */
export type WaitingTier = 'fresh' | 'due' | 'overdue'

export function getWaitingTier(days: number): WaitingTier {
  if (days >= 7) return 'overdue'
  if (days >= 3) return 'due'
  return 'fresh'
}

export const WAITING_TIER_COLOUR: Record<WaitingTier, string> = {
  fresh: '#8892aa',
  due: '#f59e0b',
  overdue: '#f87171',
}

export function waitingLabel(days: number): string {
  if (days === 0) return 'Applied today'
  if (days === 1) return 'Waiting 1 day'
  if (days < 7) return `Waiting ${days} days`
  if (days < 14) return 'Waiting over a week'
  if (days < 61) return `Waiting ${Math.floor(days / 7)} weeks`
  return `Waiting ${Math.floor(days / 30)} months`
}

/**
 * Banner copy for the coach dashboard. Obligating, never shaming — the coach is
 * a volunteer at a non-league club, not an employee. Leads with the players
 * waiting, not with the coach's failure.
 */
export function buildAwaitingReplySummary(total: number, overdue: number): { headline: string; sub: string } | null {
  if (total <= 0) return null
  const headline = total === 1
    ? '1 player is waiting on your answer'
    : `${total} players are waiting on your answer`
  const sub = overdue > 0
    ? `${overdue} ${overdue === 1 ? 'has' : 'have'} been waiting over a week. A no is still an answer — it takes one tap.`
    : 'Accept or pass — either way they know where they stand.'
  return { headline, sub }
}
