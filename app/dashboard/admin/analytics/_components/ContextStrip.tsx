import type { PlatformStats, RevenueStats } from './types'

// Demoted stock totals — thin single-row strip, not hero material.
export function ContextStrip({ platformStats, revenueStats }: {
  platformStats: PlatformStats
  revenueStats: RevenueStats
}) {
  const items = [
    { label: 'Total MRR', value: `£${(revenueStats.mrr_pence / 100).toFixed(0)}` },
    { label: 'MAU', value: platformStats.mau.toLocaleString() },
    { label: 'Total Users', value: platformStats.funnel.registered.toLocaleString() },
  ]
  return (
    <div className="flex items-center gap-4 overflow-x-auto px-1 py-1">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-4 flex-shrink-0">
          {i > 0 && <span style={{ color: '#1e2235' }}>·</span>}
          <span className="text-xs whitespace-nowrap" style={{ color: '#8892aa' }}>
            <span style={{ color: '#e8dece', fontWeight: 700 }}>{item.value}</span> {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}
