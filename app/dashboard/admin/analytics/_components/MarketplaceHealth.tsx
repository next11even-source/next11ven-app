import type { PlatformStats } from './types'
import { SectionLabel } from './ui'

export function MarketplaceHealthRow({ platformStats }: { platformStats: PlatformStats }) {
  return (
    <section>
      <SectionLabel>Marketplace Health</SectionLabel>
      <div className="rounded-xl p-3 flex flex-col gap-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
          {platformStats.contacts_7d}
        </span>
        <span className="text-xs" style={{ color: '#8892aa' }}>Connections this week</span>
      </div>
    </section>
  )
}
