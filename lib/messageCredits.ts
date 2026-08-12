/**
 * Message credit refunds — the SINGLE source of truth for the "no reply, credit
 * back" guarantee. Constants AND copy live here, because a promise that is
 * worded differently on the button, the balance page and the notification isn't
 * a guarantee, it's three vague claims.
 *
 * WHY THIS EXISTS: a premium player gets 3 outreach credits a month. Spending
 * one on a coach who never replies is the worst moment in the product — they
 * paid, they reached out, and they got silence, with nothing to show for it.
 * That is where the £6.99 gets cancelled.
 *
 * The refund costs the platform effectively nothing (quota goes largely unused)
 * and buys the strongest thing we can say at the point of sale: you're paying
 * for a conversation, not for the privilege of being ignored.
 *
 * Sibling doctrine to lib/applicationResponse.ts — silence is not the player's
 * fault, so the platform resolves it on their behalf.
 */

/**
 * Days a player-initiated conversation can go unanswered before the credit is
 * returned.
 *
 * Fourteen, not seven: a non-league coach is a volunteer with a day job, and a
 * week is inside the window where a real reply still arrives. Refunding at
 * seven would routinely hand back a credit for a conversation that then gets
 * answered on day nine — which is fine for the player but teaches us the wrong
 * number, and makes "they didn't reply" a claim we'd be making too early about
 * coaches we're also trying to keep on the platform. Two weeks of nothing is
 * unambiguous.
 *
 * The credit is NOT the cooldown. See the 3-month cooldown in
 * initiate_coach_conversation: the credit comes back fast so it can be spent
 * on someone else, while the door to this particular coach stays shut.
 */
export const REFUND_AFTER_DAYS = 14

/**
 * The guarantee starts here. Conversations opened BEFORE this date are never
 * refunded, no matter how long they've gone unanswered.
 *
 * WHY: this is a promise about how the product behaves from now on, not a
 * rebate on everything that ever went wrong. Backdating it would hand out
 * hundreds of credits — including to accounts that churned a year ago — for
 * messages sent under terms that never included a refund. Nobody was short-
 * changed: they got exactly what they paid for at the time.
 *
 * This is a FLOOR, deliberately not a query param. ?minDays can widen the
 * window and can't cross it, so no hand-typed sweep can ever accidentally
 * backfill the whole of history.
 */
export const REFUND_ELIGIBLE_FROM = '2026-08-01T00:00:00.000Z'

/** Whether a conversation falls under the guarantee at all. */
export function isRefundEligible(conversationCreatedAt: string): boolean {
  const t = new Date(conversationCreatedAt).getTime()
  if (Number.isNaN(t)) return false
  return t >= new Date(REFUND_ELIGIBLE_FROM).getTime()
}

/**
 * Hard bound on rows touched in a single cron run. With REFUND_ELIGIBLE_FROM in
 * place the steady state is a handful a day and this should never bite — it's a
 * blast radius limit, not a pacing mechanism. The route reports whether it hit
 * the cap, so if this ever does fire it isn't silent.
 */
export const MAX_REFUNDS_PER_RUN = 500

/** The promise, stated once. Used at the point of spend and on the balance page. */
export const REFUND_PROMISE = `If they don't reply within ${REFUND_AFTER_DAYS} days, we put your message credit back.`

/** Shorter form for tight spaces (pills, list rows). */
export const REFUND_PROMISE_SHORT = `No reply in ${REFUND_AFTER_DAYS} days? Credit back.`

/**
 * Where a single thread stands with the guarantee. The cron owns the actual
 * refund; this is the read-only view of the same rule for UI, so no surface
 * has to re-derive "does this thread qualify" and get it subtly wrong.
 *
 * 'none' covers everything the guarantee doesn't touch: coach-initiated
 * threads (no credit was spent), threads the coach replied to (it worked),
 * and anything opened before REFUND_ELIGIBLE_FROM.
 */
export type ThreadRefundState =
  | { kind: 'none' }
  | { kind: 'refunded' }
  /** Not yet refunded. daysLeft 0 means it's due and the next run will take it. */
  | { kind: 'pending'; daysLeft: number }

export function getThreadRefundState(input: {
  playerId: string
  initiatedBy: string | null
  coachRepliedAt: string | null
  creditRefundedAt: string | null
  createdAt: string
}): ThreadRefundState {
  const { playerId, initiatedBy, coachRepliedAt, creditRefundedAt, createdAt } = input
  if (!initiatedBy || initiatedBy !== playerId) return { kind: 'none' }
  if (coachRepliedAt) return { kind: 'none' }
  if (creditRefundedAt) return { kind: 'refunded' }
  if (!isRefundEligible(createdAt)) return { kind: 'none' }
  const due = new Date(createdAt).getTime() + REFUND_AFTER_DAYS * 86_400_000
  return { kind: 'pending', daysLeft: Math.max(0, Math.ceil((due - Date.now()) / 86_400_000)) }
}

/**
 * In-app notification copy.
 *
 * Leads with the credit, not with the silence. The player already knows nobody
 * replied — that's not news, and re-announcing it would make this the same kind
 * of excavation that NOTIFY_RESOLUTION_WITHIN_DAYS exists to prevent. What's
 * new, and actionable at any age, is that they have something to spend.
 */
export function refundNotificationMessage(count: number): string {
  if (count === 1) {
    return `You've got a message credit back. One coach didn't reply within ${REFUND_AFTER_DAYS} days, so we've returned it — spend it on another club.`
  }
  return `You've got ${count} message credits back. Those coaches didn't reply within ${REFUND_AFTER_DAYS} days, so we've returned them — spend them on other clubs.`
}
