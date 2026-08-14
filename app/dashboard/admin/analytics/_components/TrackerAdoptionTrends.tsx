import type { TrackerStats } from './types'
import { ChartCard, SectionLabel } from './ui'

// Trend charts behind the two progress bars in LeadingIndicatorsRow — that
// section answers "how far along are we", this answers "is it moving".
export function TrackerAdoptionTrends({ trackerStats }: { trackerStats: TrackerStats | null }) {
  if (!trackerStats) return null

  const matchesTotal14d = trackerStats.daily_trend.reduce((sum, d) => sum + d.value, 0)
  const careerTotal14d = trackerStats.career_daily_trend.reduce((sum, d) => sum + d.value, 0)

  return (
    <section>
      <SectionLabel>Adoption Trends</SectionLabel>
      <div className="space-y-3">
        <ChartCard
          title="Matches Logged (14d)"
          data={trackerStats.daily_trend}
          color="#38bdf8"
          total={matchesTotal14d}
        />
        <ChartCard
          title="Stat History Added (14d)"
          data={trackerStats.career_daily_trend}
          color="#a78bfa"
          total={careerTotal14d}
        />
        <p className="text-xs px-1" style={{ color: '#8892aa' }}>
          Stat history excludes the one-time legacy import (127 rows, 13 Jul) — this is self-reported adds only,
          {' '}{trackerStats.career_players_7d} new contributor{trackerStats.career_players_7d === 1 ? '' : 's'} this week.
        </p>
      </div>
    </section>
  )
}
