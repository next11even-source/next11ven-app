import type { MonthRow } from './types'

// Deterministic, template-based — no LLM call. Picks the most notable anomaly
// out of net adds / churn / new-subs trends over the last 3 months of data
// already present in monthly_table (no extra query).
export function buildNarrative(monthly: MonthRow[]): string {
  const recent = monthly.slice(-3)
  if (recent.length < 3) return 'Not enough months of data yet to spot a trend.'

  const netAdds = recent.map(m => m.new_premium - m.churned)
  const newSubs = recent.map(m => m.new_premium)
  const churned = recent.map(m => m.churned)

  const netAddsStr = netAdds.map(n => (n > 0 ? `+${n}` : `${n}`)).join('→')
  const isDeclining = netAdds[2] < netAdds[0]
  const isImproving = netAdds[2] > netAdds[0]

  const newSubsFlat = Math.abs(newSubs[2] - newSubs[0]) <= 1
  const newSubsDown = newSubs[2] < newSubs[0]
  const churnUp = churned[2] > churned[0]
  const churnMultiple = churned[0] > 0 ? churned[2] / churned[0] : churned[2] > 0 ? Infinity : 1

  if (isDeclining) {
    let cause: string
    if (churnUp && churnMultiple >= 2) {
      cause = `churn accelerating (${churned[0]}→${churned[1]}→${churned[2]}), new subs ${newSubsFlat ? 'flat' : 'not keeping pace'}`
    } else if (churnUp) {
      cause = 'churn rising faster than new subs'
    } else if (newSubsDown) {
      cause = 'new subs slowing, churn steady'
    } else {
      cause = 'churn outpacing new subs'
    }
    return `Net adds down ${netAddsStr} — ${cause}.`
  }

  if (isImproving) {
    return `Net adds up ${netAddsStr} — momentum building.`
  }

  return `Net adds holding at ${netAdds[2]}/month — churn and new subs both steady.`
}
