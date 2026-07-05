'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NewBadge from '@/app/components/NewBadge'
import type { MatchSummary } from '@/lib/performance'

type TileState =
  | { kind: 'icon'; sub: string }               // loading / locked / no games yet
  | { kind: 'stat'; value: number; sub: string } // live hero stat

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
        const defensive = data.focus === 'defensive'
        setState({
          kind: 'stat',
          value: defensive ? competitive.cleanSheets : competitive.involvements,
          sub: defensive ? 'clean sheets' : 'goal involvements',
        })
      })
      .catch(() => {})
  }, [])

  return (
    <Link href="/dashboard/performance/tracker"
      className="relative flex flex-col items-center justify-center rounded-2xl py-3 px-2 transition-all"
      style={{ backgroundColor: 'rgba(45,95,196,0.07)', border: '1.5px solid rgba(45,95,196,0.5)', textDecoration: 'none' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2d5fc4')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(45,95,196,0.5)')}>
      <span className="absolute" style={{ top: -8, right: -6 }}>
        <NewBadge force size="sm" />
      </span>
      {state.kind === 'stat' ? (
        <span className="text-2xl font-black leading-none"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
          {state.value}
        </span>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
