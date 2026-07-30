'use client'

// Read-only stats card for the profile-edit screens. The Game Performance
// Tracker is the single source of truth for stat input now — this card never
// writes anything. It shows this season's logged numbers if there are any,
// falls back to the old flat profile numbers (frozen, never edited again) if
// not, and always funnels toward the tracker. PlaceSeasonNudge (rendered
// inline) is how a legacy number actually gets promoted into real history.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PlaceSeasonNudge from '@/app/dashboard/performance/_components/PlaceSeasonNudge'

type Summary = {
  seasonLabel: string
  competitive: { apps: number; goals: number; assists: number }
  activeStint: { club_name: string; level: string | null } | null
}

type Legacy = {
  goals: number
  assists: number
  appearances: number
  season: string | null
}

const StatTile = ({ label, val }: { label: string; val: number }) => (
  <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
    <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{val}</p>
    <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</p>
  </div>
)

export default function PerformanceSummaryCard({ legacy }: { legacy: Legacy }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/performance/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setSummary(d))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const hasLogged = !!summary && summary.competitive.apps > 0
  const hasLegacy = (legacy.goals ?? 0) > 0 || (legacy.assists ?? 0) > 0 || (legacy.appearances ?? 0) > 0

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #1e2235' }}>
        <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Performance
        </h3>
        <Link href="/dashboard/performance/tracker" className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full"
          style={{ border: '1px solid #1e2235', color: '#3a6fda', textDecoration: 'none' }}>
          Open tracker
        </Link>
      </div>

      <div className="p-4 space-y-3">
        {loaded && hasLogged && summary && (
          <div>
            <p className="text-xs mb-3" style={{ color: '#8892aa' }}>
              {summary.seasonLabel}{summary.activeStint?.level ? ` · ${summary.activeStint.level}` : ''}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Apps" val={summary.competitive.apps} />
              <StatTile label="Goals" val={summary.competitive.goals} />
              <StatTile label="Assists" val={summary.competitive.assists} />
            </div>
          </div>
        )}

        {loaded && !hasLogged && hasLegacy && (
          <div>
            <p className="text-xs mb-3" style={{ color: '#8892aa' }}>{legacy.season ?? 'Last recorded'} · from your old profile</p>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Apps" val={legacy.appearances ?? 0} />
              <StatTile label="Goals" val={legacy.goals ?? 0} />
              <StatTile label="Assists" val={legacy.assists ?? 0} />
            </div>
          </div>
        )}

        {loaded && !hasLogged && !hasLegacy && (
          <p className="text-sm" style={{ color: '#8892aa' }}>
            No stats logged yet — log your first match to start building your record.
          </p>
        )}

        <Link href="/dashboard/performance/tracker"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Track your performance
        </Link>

        <PlaceSeasonNudge />
      </div>
    </div>
  )
}
