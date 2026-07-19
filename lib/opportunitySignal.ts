// Shared opportunity status-signal logic — used by the main Open Roles feed and
// the homepage "New Opportunities" preview so both show the same tiers.

export type PrimarySignal = {
  key: 'urgent' | 'first' | 'few'
  label: string
  color: string
  bg: string
  pulse?: boolean
}

function daysLeft(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }

// Single highest-priority status signal for a card. Three tiers only — the
// blanket red "Urgent" is retired:
//   urgent (red)   — GENUINE deadline pressure. Driven by deadline proximity,
//                    NOT the manual boolean. The boolean can only widen the
//                    window (7d vs 4d) — with no deadline it never fires red,
//                    so we don't recreate the red-spam problem.
//   first  (blue)  — zero applications yet ("Be first to apply").
//   few    (violet)— low application count ("Only N applied").
export function getPrimarySignal(opp: { urgent: boolean; deadline: string | null; application_count: number }): PrimarySignal | null {
  const dl = opp.deadline ? daysLeft(opp.deadline) : null
  const urgentWindow = opp.urgent ? 7 : 4
  if (dl !== null && dl >= 0 && dl <= urgentWindow) {
    return { key: 'urgent', label: dl === 0 ? '⏳ Closes today' : `⏳ ${dl}d left`, color: '#fb7185', bg: 'rgba(244,63,94,0.12)', pulse: true }
  }
  if (opp.application_count === 0) return { key: 'first', label: '🚀 Be first to apply', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' }
  if (opp.application_count < 5) return { key: 'few', label: `👥 Only ${opp.application_count} applied`, color: '#c084fc', bg: 'rgba(168,85,247,0.12)' }
  return null
}
