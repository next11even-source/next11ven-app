'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { COLORS } from '@/components/ui/tokens'
import type { MatchSummary } from '@/lib/performance'

type TileState =
  | { kind: 'icon'; sub: string; href: string }                              // loading / locked / no games yet
  | { kind: 'stat'; num: string; unit: string | null; sub: string; href: string } // live stat with its unit

const HUB = '/dashboard/performance/tracker'
const LOG = '/dashboard/performance/tracker/log'

// The number must mean something at a glance, so it carries its unit and the
// stat is picked per position with positive fallbacks: attackers lead with
// G/A, defenders/keepers with clean sheets; when that's 0 fall back to avg
// minutes (the reliability stat), then avg rating, then apps.
function pickStat(s: MatchSummary, defensive: boolean): { num: string; unit: string | null; sub: string } {
  // Avg minutes per game applies to every player and isn't shown anywhere else,
  // so it's the sub-line whenever we have it and it isn't already the headline.
  const avgMins = s.avgMinutes != null && s.avgMinutes > 0 ? `${s.avgMinutes}' avg / game` : null
  if (defensive && s.cleanSheets > 0) {
    return { num: String(s.cleanSheets), unit: 'CS', sub: avgMins ?? `clean sheet${s.cleanSheets === 1 ? '' : 's'}` }
  }
  if (!defensive && s.involvements > 0) {
    return { num: String(s.involvements), unit: 'G/A', sub: avgMins ?? 'goals + assists' }
  }
  if (s.avgMinutes != null && s.avgMinutes > 0) {
    return { num: `${s.avgMinutes}'`, unit: null, sub: `avg mins · ${s.apps} app${s.apps === 1 ? '' : 's'}` }
  }
  if (s.avgRating != null) {
    return { num: s.avgRating.toFixed(1), unit: null, sub: 'avg rating' }
  }
  return { num: String(s.apps), unit: null, sub: `app${s.apps === 1 ? '' : 's'} this season` }
}

// Homepage quick-stats tile for the Game Performance Tracker — sits in the
// same row as Profile Views and Opportunities, so it leads with a number as
// soon as the player has logged a game. Until then (or when the summary is
// premium-locked) it's a doorway with a clear first action.
//
// Same Card treatment as its row-mates (Session 5, 22 Aug 2026) — promoted
// via a small accent dot in the corner rather than a different border colour
// or number hue (see CLAUDE.md, supersedes the 19 Aug "one colour per tile" note).
export default function TrackerStatTile() {
  const [state, setState] = useState<TileState>({ kind: 'icon', sub: 'track your season', href: HUB })

  useEffect(() => {
    fetch('/api/performance/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return // locked or error — stay a doorway
        const competitive = data.competitive as MatchSummary
        if (!competitive || competitive.apps === 0) {
          // No data yet: writers deep-link straight to the log form (no hunt);
          // read-only players get the hub doorway, not a CTA they can't act on.
          const readonly = data.access === 'readonly'
          setState({ kind: 'icon', sub: readonly ? 'track your season' : 'log your first match', href: readonly ? HUB : LOG })
          return
        }
        setState({ kind: 'stat', ...pickStat(competitive, data.focus === 'defensive'), href: HUB })
      })
      .catch(() => {})
  }, [])

  return (
    <Card href={state.href} interactive
      className="relative flex flex-col items-center justify-center text-center"
      style={{ padding: '12px 8px' }}>
      <span aria-hidden="true" className="absolute rounded-full" style={{ top: 8, right: 8, width: 6, height: 6, backgroundColor: COLORS.accent }} />
      {state.kind === 'stat' ? (
        <span className="leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: COLORS.text }}>
          <span className="text-2xl font-black">{state.num}</span>
          {state.unit && <span className="text-sm font-black ml-1">{state.unit}</span>}
        </span>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )}
      <span className="mt-1 leading-tight font-semibold" style={{ color: COLORS.textMuted, fontSize: 10 }}>
        Track Your Games
      </span>
      <span className="text-xs mt-0.5 leading-tight" style={{ color: COLORS.textMuted }}>{state.sub}</span>
    </Card>
  )
}
