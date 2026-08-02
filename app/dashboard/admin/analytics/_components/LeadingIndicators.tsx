import type { PlatformStats, TrackerStats } from './types'
import { SectionLabel } from './ui'

export function LeadingIndicatorsRow({ platformStats, trackerStats }: {
  platformStats: PlatformStats
  trackerStats: TrackerStats | null
}) {
  const activationPct = platformStats.activation_denominator_7d > 0
    ? Math.round((platformStats.activation_numerator_7d / platformStats.activation_denominator_7d) * 100)
    : 0
  const migrationPct = platformStats.funnel.approved > 0
    ? Math.round((platformStats.ever_signed_in / platformStats.funnel.approved) * 100)
    : 0
  const trackerPct = trackerStats && trackerStats.eligible_players > 0
    ? Math.round((trackerStats.adopters_total / trackerStats.eligible_players) * 100)
    : 0

  return (
    <section>
      <SectionLabel>Leading Indicators</SectionLabel>
      <div className="space-y-2">
        {/* Weekly active coaches vs player premium conversions */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-2xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                {platformStats.weekly_active_coaches}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Weekly active coaches</span>
            </div>
            <div>
              <span className="text-2xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                {platformStats.player_premium_conversions_7d}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Player Premium conversions (7d)</span>
            </div>
          </div>
        </div>

        {/* Activation */}
        <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Activation — new signups (7d)</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
              {platformStats.activation_numerator_7d} / {platformStats.activation_denominator_7d}
            </span>
          </div>
          <div className="w-full rounded-full h-2" style={{ backgroundColor: '#1e2235' }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${activationPct}%`, backgroundColor: '#2d5fc4' }} />
          </div>
          <p className="text-xs" style={{ color: '#8892aa' }}>
            {activationPct}% took an action within 7 days · {migrationPct}% of the migrated base has ever signed in (macro)
          </p>
        </div>

        {/* Tracker adoption reframed as the Coach Pro blocker */}
        {trackerStats && (
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Tracker adoption — the Coach Pro blocker</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                {trackerStats.adopters_total} / {trackerStats.eligible_players}
              </span>
            </div>
            <div className="w-full rounded-full h-2" style={{ backgroundColor: '#1e2235' }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${trackerPct}%`, backgroundColor: '#38bdf8' }} />
            </div>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              {trackerPct}% logged a match — Coach Pro search depends on this pool growing
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
