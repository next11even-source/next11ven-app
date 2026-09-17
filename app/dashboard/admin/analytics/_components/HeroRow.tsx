'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { HeroStats } from './types'
import { LoadingCard } from './ui'

// Movement colour doctrine: green signals growth (this-period-vs-last
// increase) — the one deliberate carve-out from the app-wide "no green
// outside availability signals" rule, scoped to analytics comparisons only
// (see CLAUDE.md Brand & Style). Amber is "needs attention" on the way down,
// never red — a dip in a solo founder's own dashboard doesn't need alarm-red.
const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#f59e0b'
const FLAT_COLOR = '#8892aa'

type DayWindow = 7 | 14 | 30 | 90
const DAY_WINDOWS: { value: DayWindow; label: string }[] = [
  { value: 7,  label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

function MovementLabel({ current, previous, compareLabel, format }: {
  current: number
  previous: number
  compareLabel: string
  format?: (n: number) => string
}) {
  const delta = current - previous
  const fmt = format ?? ((n: number) => n.toLocaleString())

  if (delta === 0) {
    return <span className="text-xs" style={{ color: FLAT_COLOR }}>No change {compareLabel}</span>
  }

  const up = delta > 0
  return (
    <span className="text-xs font-semibold" style={{ color: up ? UP_COLOR : DOWN_COLOR }}>
      {up ? '▲' : '▼'} {fmt(Math.abs(delta))} {compareLabel}
    </span>
  )
}

function HeroTile({ label, value, valueColor = '#e8dece', children }: {
  label: string
  value: string
  valueColor?: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1.5" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: valueColor }}>
        {value}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#e8dece', fontSize: 10 }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const formatPence = (n: number) => `£${(n / 100).toFixed(0)}`

/**
 * Layer 1 hero row — the whole first screen. Five numbers, each answering
 * "what would I do differently based on this?", each with a this-period-vs-
 * last-period movement.
 *
 * Active coaches/players use the selected rolling window.
 * MRR and conversions remain on calendar-month MTD — those are inherently
 * monthly concepts, so they don't change with the window selector.
 */
export function HeroRow() {
  const [days, setDays] = useState<DayWindow>(30)
  const [heroStats, setHeroStats] = useState<HeroStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/hero-stats?days=${days}`)
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then((d: HeroStats) => { setHeroStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading || !heroStats) return <LoadingCard />

  const mrrNow = heroStats.net_new_mrr_pence.current
  // Net new MRR is the one hero value that's itself a signed growth figure
  // (not just its movement-vs-last-month), so it gets the same green/amber
  // treatment as the movement arrows, not the neutral cream every other tile uses.
  const mrrColor = mrrNow >= 0 ? UP_COLOR : DOWN_COLOR

  return (
    <section>
      {/* Window selector — only affects the "active" tiles */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs" style={{ color: '#8892aa' }}>
          Active window — affects coach &amp; player counts only
        </p>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value, 10) as DayWindow)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none appearance-none cursor-pointer"
          style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
        >
          {DAY_WINDOWS.map(w => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <HeroTile label={`Active coaches (${days}d)`} value={heroStats.active_coaches.current.toLocaleString()}>
          <MovementLabel
            current={heroStats.active_coaches.current}
            previous={heroStats.active_coaches.previous}
            compareLabel={`vs prior ${days}d`}
          />
        </HeroTile>

        <HeroTile label={`Active players (${days}d)`} value={heroStats.active_players.current.toLocaleString()}>
          <MovementLabel
            current={heroStats.active_players.current}
            previous={heroStats.active_players.previous}
            compareLabel={`vs prior ${days}d`}
          />
        </HeroTile>

        <HeroTile label="Net new MRR" value={`${mrrNow < 0 ? '-' : ''}${formatPence(Math.abs(mrrNow))}`} valueColor={mrrColor}>
          <MovementLabel
            current={mrrNow}
            previous={heroStats.net_new_mrr_pence.previous}
            compareLabel="vs same point last month"
            format={formatPence}
          />
        </HeroTile>

        <div className="col-span-2 rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-xs font-semibold uppercase tracking-wider block mb-2.5" style={{ color: '#e8dece', fontSize: 10 }}>
            Pro conversions this month
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-2xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                {heroStats.premium_conversions.current.player}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Player</span>
              <div className="mt-1">
                <MovementLabel
                  current={heroStats.premium_conversions.current.player}
                  previous={heroStats.premium_conversions.previous.player}
                  compareLabel="vs same point last month"
                />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                {heroStats.premium_conversions.current.coach}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Coach</span>
              <div className="mt-1">
                <MovementLabel
                  current={heroStats.premium_conversions.current.coach}
                  previous={heroStats.premium_conversions.previous.coach}
                  compareLabel="vs same point last month"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
