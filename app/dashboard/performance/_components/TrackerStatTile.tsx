'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NewBadge from '@/app/components/NewBadge'
import type { MatchSummary } from '@/lib/performance'

type TileState =
  | { kind: 'icon'; sub: string }                              // loading / locked / no games yet
  | { kind: 'stat'; num: string; unit: string | null; sub: string } // live stat with its unit

// The number must mean something at a glance, so it carries its unit and the
// stat is picked per position with positive fallbacks: attackers lead with
// G/A, defenders/keepers with clean sheets; when that's 0 fall back to avg
// minutes (the reliability stat), then avg rating, then apps.
function pickStat(s: MatchSummary, defensive: boolean): { num: string; unit: string | null; sub: string } {
  if (defensive && s.cleanSheets > 0) {
    return { num: String(s.cleanSheets), unit: 'CS', sub: `clean sheet${s.cleanSheets === 1 ? '' : 's'}` }
  }
  if (!defensive && s.involvements > 0) {
    return { num: String(s.involvements), unit: 'G/A', sub: 'goals + assists' }
  }
  if (s.avgMinutes != null && s.avgMinutes > 0) {
    return { num: `${s.avgMinutes}'`, unit: null, sub: 'avg minutes' }
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
export default function TrackerStatTile() {
  const [state, setState] = useState<TileState>({ kind: 'icon', sub: 'track your season' })

  useEffect(() => {
    fetch('/api/performance/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return // locked or error — stay a doorway
        const competitive = data.competitive as MatchSummary
        if (!competitive || competitive.apps === 0) {
          setState({ kind: 'icon', sub: 'log your first match' })
          return
        }
        setState({ kind: 'stat', ...pickStat(competitive, data.focus === 'defensive') })
      })
      .catch(() => {})
  }, [])

  return (
    <Link href="/dashboard/performance/tracker"
      className="relative flex flex-col items-center justify-center rounded-2xl py-3 px-2 transition-all"
      style={{ backgroundColor: 'rgba(56,189,248,0.07)', border: '1.5px solid rgba(56,189,248,0.5)', textDecoration: 'none' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#38bdf8')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.5)')}>
      <span className="absolute" style={{ top: -8, right: -6 }}>
        <NewBadge force size="sm" />
      </span>
      {state.kind === 'stat' ? (
        <span className="leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#38bdf8' }}>
          <span className="text-2xl font-black">{state.num}</span>
          {state.unit && <span className="text-sm font-black ml-1">{state.unit}</span>}
        </span>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )}
      <span className="text-xs mt-1 text-center leading-tight font-semibold" style={{ color: '#e8dece', fontSize: 10 }}>
        Game Performance Tracker
      </span>
      <span className="text-xs mt-0.5 text-center leading-tight" style={{ color: '#8892aa' }}>{state.sub}</span>
    </Link>
  )
}
