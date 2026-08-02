import type { PlatformStats } from './types'
import { SectionLabel } from './ui'

function formatHours(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 24) return `${hours}h`
  return `${(hours / 24).toFixed(1)}d`
}

export function MarketplaceHealthRow({ platformStats }: { platformStats: PlatformStats }) {
  const reachPct = platformStats.actively_looking_total > 0
    ? Math.round((platformStats.actively_looking_contacted_7d / platformStats.actively_looking_total) * 100)
    : 0

  return (
    <section>
      <SectionLabel>Marketplace Health</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
            {platformStats.contacts_7d}
          </span>
          <span className="text-xs" style={{ color: '#8892aa' }}>Connections this week</span>
        </div>
        <div className="rounded-xl p-3 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
            {reachPct}%
          </span>
          <span className="text-xs" style={{ color: '#8892aa' }}>
            Actively Looking got seen ({platformStats.actively_looking_contacted_7d}/{platformStats.actively_looking_total})
          </span>
        </div>
        <div className="rounded-xl p-3 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
            {formatHours(platformStats.avg_time_to_first_contact_hours)}
          </span>
          <span className="text-xs" style={{ color: '#8892aa' }}>Avg time to first contact</span>
        </div>
      </div>
    </section>
  )
}
