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

/**
 * A coach still owes an answer only while the application is open. Once the
 * platform has closed it (see CLOSE_AFTER_DAYS) we stop counting it and stop
 * nudging — chasing a coach about a 90-day-old application they were already
 * chased about a dozen times is how a nudge becomes noise they filter out.
 */
export function isAwaitingReply(
  status: string | null | undefined,
  closedAt?: string | null
): boolean {
  if (closedAt) return false
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

/* ─── Player-side closure ─────────────────────────────────────────────────────
 *
 * The coach's view of an application is "have I answered it". The player's view
 * is "do I know where I stand". Those diverge, and the player's side is the one
 * that was broken — a bare "Pending" chip that never resolved.
 *
 * Closure never claims the coach rejected them. It says the application is over
 * and points at what's open now. Silence and a no are the same outcome, but
 * they are NOT the same message, and dressing silence up as a rejection would
 * be putting words in a coach's mouth.
 */

/**
 * Days an application waits before the platform closes it on the player's
 * behalf. Three weeks is past the point any honest coach is still deciding, and
 * comfortably past several rounds of the nudge cron (first at 3 days, then
 * every 5) — so the coach always gets a real chance to answer first.
 */
export const CLOSE_AFTER_DAYS = 21

/**
 * Max applications closed per player per cron run. Without this the first run
 * would resolve a player's entire backlog at once — one player in the 9 Aug
 * data had eight outstanding — and eight "closed" cards landing together reads
 * as a mass rejection no matter how the copy is worded.
 *
 * Four, not two, because the cron is WEEKLY: bad news should arrive rarely
 * rather than steadily, and a daily run at two-a-day meant a player with a
 * deep backlog got a closure notification every morning for a week. One row a
 * week saying "4 closed" is a single piece of news; seven mornings of "2
 * closed" is a drumbeat. The run still emits exactly one notification per
 * player regardless of how many it closed.
 */
export const MAX_CLOSURES_PER_PLAYER_PER_RUN = 4

/**
 * How recently a player must have applied for a resolution to be worth actively
 * telling them about (6 weeks).
 *
 * WHY: past this point the player has moved on, and a notification is no longer
 * information — it's an excavation. Telling someone in August that a club they
 * approached in March isn't interested doesn't help them do anything; it just
 * re-opens something they'd already closed themselves, and makes the platform
 * the bearer of stale bad news.
 *
 * Older applications still resolve — the card updates, the history is honest,
 * and it stops counting against the coach. They resolve QUIETLY: no push, no
 * email. Nothing is hidden, it's just not announced.
 *
 * Applies to platform closure AND to a coach's late decline. It does NOT apply
 * to an acceptance — good news never goes stale, and a club that finally says
 * yes after five months is exactly the message worth chasing someone down for.
 */
export const NOTIFY_RESOLUTION_WITHIN_DAYS = 42

export type PlayerApplicationState =
  | 'waiting'
  | 'shortlisted'
  | 'accepted'
  | 'rejected'
  | 'closed_no_response'
  | 'closed_role_gone'

export function getPlayerApplicationState(
  status: string | null | undefined,
  closedAt?: string | null,
  closeReason?: string | null
): PlayerApplicationState {
  // A real coach decision always wins over a platform closure — if a coach
  // answered late, after we'd already closed it, the player sees the answer.
  if (status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  if (closedAt) return closeReason === 'role_closed' ? 'closed_role_gone' : 'closed_no_response'
  if (status === 'shortlisted') return 'shortlisted'
  return 'waiting'
}

/**
 * Player-facing copy. Note what's absent: no "Pending", no "Viewed", and no
 * read-receipt equivalent. "Viewed" was the worst of the old labels — it told
 * a player they'd been looked at and passed over without anyone saying so.
 */
export const PLAYER_APPLICATION_COPY: Record<
  PlayerApplicationState,
  { label: string; colour: string; bg: string; detail?: string }
> = {
  waiting: {
    label: 'With the club',
    colour: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    detail: "We'll chase them for an answer.",
  },
  shortlisted: {
    label: 'Shortlisted',
    colour: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
    detail: "You're on their list — they haven't made a final call yet.",
  },
  accepted: {
    // Blue, not green. Green is reserved for availability signals; the existing
    // accepted chip was already blue and there's no reason to churn it.
    label: '✓ Accepted',
    colour: '#2d5fc4',
    bg: 'rgba(45,95,196,0.15)',
    detail: 'Check your messages — the club wants to speak to you.',
  },
  rejected: {
    label: 'Not this time',
    colour: '#8892aa',
    bg: 'rgba(136,146,170,0.1)',
    detail: 'They went another way. Plenty more open.',
  },
  closed_no_response: {
    label: 'Closed — no reply',
    colour: '#8892aa',
    bg: 'rgba(136,146,170,0.1)',
    detail: "This one went quiet, so we've closed it rather than leave you waiting.",
  },
  closed_role_gone: {
    label: 'Role withdrawn',
    colour: '#8892aa',
    bg: 'rgba(136,146,170,0.1)',
    detail: 'The club took this role down before deciding.',
  },
}

/** True where the player has nothing left to wait for and should be redirected. */
export function isDeadEnd(state: PlayerApplicationState): boolean {
  return state === 'rejected' || state === 'closed_no_response' || state === 'closed_role_gone'
}
