/**
 * Opportunity staleness / neglect — the single source of truth for when a
 * role should come down on the coach's behalf. Mirrors lib/applicationResponse.ts
 * (which owns the equivalent rule for individual applications) so the two
 * never drift.
 *
 * WHY THIS EXISTS: application-close's dry run found 81 of 85 stale
 * applications sitting on opportunities still marked active — coaches
 * abandon a role without taking it down, and every application landing on it
 * afterwards is a player spending a premium application into a graveyard.
 *
 * Every surface that decides "is this role dying" (the closure cron and the
 * pre-close warning folded into the nudge cron) must agree on the same
 * thresholds — never re-derive them inline.
 */

import { waitingDays } from './applicationResponse'

export { waitingDays as ageDays }

/** Generic ceiling — nothing stays live forever, whatever its activity. */
export const OPP_MAX_AGE_DAYS = 28

/**
 * A role with an application still awaiting reply at this age, and zero
 * accept/reject ever on it, gets deactivated early. Half the generic ceiling
 * — this is the sharp case (real applicants going unread), not the backstop.
 */
export const OPP_NEGLECT_DAYS = 14

/**
 * How many days before the neglect cutoff a role is flagged "at risk" in the
 * coach nudge email/SMS. Gives the coach a real window to act before the role
 * disappears, riding the existing nudge send rather than a new one.
 */
export const OPP_NEGLECT_WARNING_DAYS = 4

export type OpportunityLifecycleStatus = 'active' | 'at_risk' | 'neglected' | 'stale'

/**
 * @param ageDaysSincePosted   days since the opportunity was created
 * @param hasAwaitingApplication  true if any application on it is still awaiting reply
 * @param hasEverActioned      true if the coach has ever accepted or rejected an
 *                              applicant on this role — a role with real
 *                              decisions on it isn't neglected, even if newer
 *                              applicants are still waiting.
 */
export function getOpportunityLifecycleStatus(
  ageDaysSincePosted: number,
  hasAwaitingApplication: boolean,
  hasEverActioned: boolean
): OpportunityLifecycleStatus {
  if (ageDaysSincePosted >= OPP_MAX_AGE_DAYS) return 'stale'
  if (hasAwaitingApplication && !hasEverActioned) {
    if (ageDaysSincePosted >= OPP_NEGLECT_DAYS) return 'neglected'
    if (ageDaysSincePosted >= OPP_NEGLECT_DAYS - OPP_NEGLECT_WARNING_DAYS) return 'at_risk'
  }
  return 'active'
}
