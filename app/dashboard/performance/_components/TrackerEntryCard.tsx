'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { performanceTrackerEnabled, type MatchSummary } from '@/lib/performance'

type CardStat = { value: number; label: string; seasonLabel: string }

// Entry point card for the player homepage. Renders nothing while the global
// kill switch is off. Number-first when the player has logged games — a stat
// they can glance at daily builds the habit; the tagline is only the doorway
// for players who haven't started (or are locked, where the summary 403s).
export default function TrackerEntryCard() {
  const enabled = performanceTrackerEnabled()
  const [stat, setStat] = useState<CardStat | null>(null)

  useEffect(() => {
    if (!enabled) return
    fetch('/api/performance/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        const competitive = data.competitive as MatchSummary
        if (!competitive || competitive.apps === 0) return
        const defensive = data.focus === 'defensive'
        setStat({
          value: defensive ? competitive.cleanSheets : competitive.involvements,
          label: defensive ? 'Clean sheets' : 'Goal involvements',
          seasonLabel: data.seasonLabel,
        })
      })
      .catch(() => {})
  }, [enabled])

  if (!enabled) return null

  return (
    <section className="px-4">
      <Link href="/dashboard/performance/tracker"
        className="flex items-center gap-3 rounded-2xl px-4 py-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}>
        {stat ? (
          <span className="min-w-10 text-center text-3xl font-black leading-none flex-shrink-0"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#3a6fda' }}>
            {stat.value}
          </span>
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Game Performance Tracker</p>
          <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
            {stat
              ? `${stat.label} · ${stat.seasonLabel}`
              : 'Log your matches. Watch your season build.'}
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>
    </section>
  )
}
