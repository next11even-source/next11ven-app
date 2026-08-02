// ─── Admin analytics — single source of truth for goals & health-state thresholds ───
//
// Founder-declared targets live here, not scattered through components. If the
// £500 MRR goal or its deadline changes, change it once.
//
// NOTE on colour: brand rules reserve green (#22c55e) for availability signals
// and positive confirmations only — never general UI. The existing InsightCard
// trend arrows already encode "good" as blue and "bad" as red rather than using
// green, so the health states below follow that same precedent instead of
// introducing green as a fourth colour.

export const MRR_GOAL_PENCE = 50000 // £500
export const MRR_GOAL_LABEL = '£500 MRR'
export const MRR_GOAL_DEADLINE = new Date('2026-10-31T23:59:59Z')

export type HealthState = 'good' | 'amber' | 'red'

export const HEALTH_COLORS: Record<HealthState, string> = {
  good: '#2d5fc4',
  amber: '#f59e0b',
  red: '#ef4444',
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

export type MrrGoalProgress = {
  deadline: Date
  monthsRemaining: number
  penceRemaining: number
  paceNeededPencePerMonth: number
  paceActualPencePerMonth: number
  progressPct: number
  state: HealthState
}

// paceActualPencePerMonth should be a trailing average (e.g. last 3 months of
// net-new MRR), not a single volatile month.
export function getMrrGoalProgress(
  currentMrrPence: number,
  paceActualPencePerMonth: number,
  now: Date = new Date()
): MrrGoalProgress {
  const monthsRemaining = Math.max(
    (MRR_GOAL_DEADLINE.getTime() - now.getTime()) / MS_PER_MONTH,
    0
  )
  const penceRemaining = Math.max(MRR_GOAL_PENCE - currentMrrPence, 0)
  const paceNeededPencePerMonth = monthsRemaining > 0 ? penceRemaining / monthsRemaining : penceRemaining
  const progressPct = Math.min(100, Math.round((currentMrrPence / MRR_GOAL_PENCE) * 100))

  let state: HealthState = 'red'
  if (penceRemaining === 0) {
    state = 'good'
  } else if (paceActualPencePerMonth >= paceNeededPencePerMonth) {
    state = 'good'
  } else if (paceActualPencePerMonth >= paceNeededPencePerMonth * 0.5) {
    state = 'amber'
  }

  return { deadline: MRR_GOAL_DEADLINE, monthsRemaining, penceRemaining, paceNeededPencePerMonth, paceActualPencePerMonth, progressPct, state }
}

export type MonthlyNetAdds = { label: string; net_adds: number }

// Coach Pro: standing alarm until it moves. Red while flat/declining, amber on
// any single net add, good only once growth has held for 3 consecutive months.
export function getCoachProAlarmState(monthly: MonthlyNetAdds[]): HealthState {
  if (monthly.length === 0) return 'red'
  const last = monthly[monthly.length - 1]
  if (last.net_adds <= 0) return 'red'
  const lastThree = monthly.slice(-3)
  const allGrowing = lastThree.length >= 3 && lastThree.every(m => m.net_adds > 0)
  return allGrowing ? 'good' : 'amber'
}
