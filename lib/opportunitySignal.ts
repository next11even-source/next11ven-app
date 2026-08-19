// Shared opportunity status-signal logic — used by the main Open Roles feed and
// the homepage "New Opportunities" preview so both show the same tiers.

import { Clock, Zap, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { COLORS } from '@/components/ui/tokens'

export type PrimarySignal = {
  key: 'urgent' | 'first' | 'few'
  label: string
  icon: LucideIcon
  color: string
  bg: string
  pulse?: boolean
}

function daysLeft(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }

// Single highest-priority status signal for a card. Three tiers only — the
// blanket red "Urgent" is retired:
//   urgent (rose)  — GENUINE deadline pressure. Driven by deadline proximity,
//                    NOT the manual boolean. The boolean can only widen the
//                    window (7d vs 4d) — with no deadline it never fires red,
//                    so we don't recreate the red-spam problem. Deadline
//                    pressure reads as more severe than scarcity, so it keeps
//                    its own rose, not the amber below.
//   first  (amber) — zero applications yet ("Be first to apply").
//   few    (amber) — low application count ("Only N applied"). Same amber as
//                    `first` — both are the same scarcity family (corrected
//                    20 Aug 2026, was blue/violet — violet is reserved
//                    elsewhere in the app as the coach/shortlisted identity
//                    colour, unrelated to this signal, but still worth not
//                    colliding with). Uses the shared Badge "urgent" tone
//                    colour so it stays in sync with COLORS.urgent.
export function getPrimarySignal(opp: { urgent: boolean; deadline: string | null; application_count: number }): PrimarySignal | null {
  const dl = opp.deadline ? daysLeft(opp.deadline) : null
  const urgentWindow = opp.urgent ? 7 : 4
  if (dl !== null && dl >= 0 && dl <= urgentWindow) {
    return { key: 'urgent', label: dl === 0 ? 'Closes today' : `${dl}d left`, icon: Clock, color: '#fb7185', bg: 'rgba(244,63,94,0.12)', pulse: true }
  }
  if (opp.application_count === 0) return { key: 'first', label: 'Be first to apply', icon: Zap, color: COLORS.urgent, bg: COLORS.urgentBg }
  if (opp.application_count < 5) return { key: 'few', label: `Only ${opp.application_count} applied`, icon: Users, color: COLORS.urgent, bg: COLORS.urgentBg }
  return null
}
