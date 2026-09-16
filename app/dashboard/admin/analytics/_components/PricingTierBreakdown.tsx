'use client'

import type { PricePoint } from './types'
import { SectionLabel } from './ui'

function tierLabel(tier: PricePoint): string {
  const amount = tier.unit_amount_pence / 100
  if (tier.unit_amount_pence < 699) return `Legacy — £${amount.toFixed(2)}/mo`
  if (tier.unit_amount_pence >= 999) return `Coach Pro — £${amount.toFixed(2)}/mo`
  return `Player Pro — £${amount.toFixed(2)}/mo`
}

function tierColor(tier: PricePoint): string {
  if (tier.unit_amount_pence < 699) return '#8892aa'
  if (tier.unit_amount_pence >= 999) return '#a78bfa'
  return '#2d5fc4'
}

export function PricingTierBreakdown({ priceBreakdown }: { priceBreakdown: PricePoint[] }) {
  if (!priceBreakdown.length) return null

  const sorted = [...priceBreakdown].sort((a, b) => b.mrr_pence - a.mrr_pence)
  const totalMrr = sorted.reduce((s, t) => s + t.mrr_pence, 0)
  const totalSubs = sorted.reduce((s, t) => s + t.subscriber_count, 0)

  return (
    <section>
      <SectionLabel>Pricing Tiers</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
        {sorted.map((tier, i) => {
          const pct = totalMrr > 0 ? (tier.mrr_pence / totalMrr) * 100 : 0
          const color = tierColor(tier)
          const label = tierLabel(tier)
          const subsPct = totalSubs > 0 ? Math.round((tier.subscriber_count / totalSubs) * 100) : 0

          return (
            <div
              key={tier.price_id}
              className="px-4 py-3 space-y-1.5"
              style={{
                backgroundColor: i % 2 === 0 ? '#13172a' : '#0f1222',
                borderBottom: i < sorted.length - 1 ? '1px solid #1e2235' : 'none',
              }}
            >
              {/* Row header */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold" style={{ color }}>{label}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs tabular-nums" style={{ color: '#8892aa' }}>
                    {tier.subscriber_count} sub{tier.subscriber_count !== 1 ? 's' : ''} ({subsPct}%)
                  </span>
                  <span className="text-sm font-black tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
                    £{(tier.mrr_pence / 100).toFixed(2)}/mo
                  </span>
                </div>
              </div>

              {/* Proportional MRR bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#1e2235' }}>
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${pct.toFixed(1)}%`, backgroundColor: color, opacity: 0.75 }}
                  />
                </div>
                <span className="text-xs tabular-nums flex-shrink-0" style={{ color: '#3a4055', minWidth: 34, textAlign: 'right' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}

        {/* Footer totals */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ backgroundColor: '#0a0a0a', borderTop: '1px solid #1e2235' }}>
          <span className="text-xs" style={{ color: '#8892aa' }}>{totalSubs} total subscribers</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: '#e8dece' }}>
            £{(totalMrr / 100).toFixed(2)}/mo total
          </span>
        </div>
      </div>
    </section>
  )
}
