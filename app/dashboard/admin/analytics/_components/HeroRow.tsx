import type { ReactNode } from 'react'
import type { HeroStats } from './types'

// Movement colour doctrine: green signals growth (this-period-vs-last
// increase) — the one deliberate carve-out from the app-wide "no green
// outside availability signals" rule, scoped to analytics comparisons only
// (see CLAUDE.md Brand & Style). Amber is "needs attention" on the way down,
// never red — a dip in a solo founder's own dashboard doesn't need alarm-red.
const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#f59e0b'
const FLAT_COLOR = '#8892aa'

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
 * last-period movement. Everything else on the analytics tab lives below
 * this, in the tabs.
 */
export function HeroRow({ heroStats }: { heroStats: HeroStats }) {
  const mrrNow = heroStats.net_new_mrr_pence.current
  // Net new MRR is the one hero value that's itself a signed growth figure
  // (not just its movement-vs-last-month), so it gets the same green/amber
  // treatment as the movement arrows, not the neutral cream every other tile uses.
  const mrrColor = mrrNow >= 0 ? UP_COLOR : DOWN_COLOR

  return (
    <section className="grid grid-cols-2 gap-2.5">
      <HeroTile label="Active coaches (30d)" value={heroStats.active_coaches_30d.current.toLocaleString()}>
        <MovementLabel
          current={heroStats.active_coaches_30d.current}
          previous={heroStats.active_coaches_30d.previous}
          compareLabel="vs prior 30d"
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

      <HeroTile label="Opportunities posted" value={heroStats.opportunities_posted.current.toLocaleString()}>
        <MovementLabel
          current={heroStats.opportunities_posted.current}
          previous={heroStats.opportunities_posted.previous}
          compareLabel="vs same point last month"
        />
      </HeroTile>

      <HeroTile label="Connections started" value={heroStats.connections_started.current.toLocaleString()}>
        <MovementLabel
          current={heroStats.connections_started.current}
          previous={heroStats.connections_started.previous}
          compareLabel="vs same point last month"
        />
      </HeroTile>

      <div className="col-span-2 rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <span className="text-xs font-semibold uppercase tracking-wider block mb-2.5" style={{ color: '#e8dece', fontSize: 10 }}>
          Premium conversions this month
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
    </section>
  )
}
