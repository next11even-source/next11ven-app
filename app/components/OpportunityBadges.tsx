'use client'

import Icon from '@/components/ui/Icon'
import { COLORS } from '@/components/ui/tokens'
import { Lock } from 'lucide-react'

// Match percentage as typography (the premium hook), not a badge — a big
// number reads as more earned than a pill, and it keeps match % out of the
// hue system entirely (it's neutral data, not an availability or action
// signal — see CLAUDE.md). Strong matches (90%+) are signalled by scaling the
// number up, not by colour. Shared by the Open Roles feed and the homepage
// preview so a match score never looks different depending on where it's
// read (Session 5, 22 Aug 2026 — previously duplicated in both places).
// 60 (the floor from getOpportunityMatchPercent) is withheld entirely — it's
// a generic "no particular signal" score, and a fake-looking 60% erodes
// trust in every other number more than showing nothing does (26 Aug 2026).
export function MatchTypography({ matchPercent, isPremium, onLocked, scale = 1 }: {
  matchPercent: number | null
  isPremium: boolean
  onLocked?: () => void
  /** Shrinks the whole block proportionally for compact rows (e.g. the homepage preview). */
  scale?: number
}) {
  if (isPremium && matchPercent !== null && matchPercent > 60) {
    const strong = matchPercent >= 90
    const numberSize = Math.round((strong ? 22 : 19) * scale)
    return (
      <div className="flex-shrink-0 text-right">
        <div style={{ lineHeight: 1 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: numberSize, fontWeight: 800, color: COLORS.text }}>{matchPercent}</span>
          <span style={{ fontSize: Math.round(13 * scale), color: COLORS.textMuted2 }}>%</span>
        </div>
        <div style={{ fontSize: Math.round(11 * scale), color: COLORS.textMuted2, marginTop: 2 }}>match</div>
      </div>
    )
  }
  if (isPremium) return null // premium but no signal to score against
  return (
    <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); onLocked?.() }}
      aria-label="Match score locked — upgrade to Pro to see how well this role fits you"
      className="flex-shrink-0 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8] rounded">
      <Icon icon={Lock} size="xs" label={true} className="ml-auto" style={{ color: COLORS.textMuted2 }} />
      <div style={{ fontSize: Math.round(11 * scale), color: COLORS.textMuted2, marginTop: 2 }}>match</div>
    </button>
  )
}
