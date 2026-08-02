import { HEALTH_COLORS, getCoachProAlarmState } from '@/lib/analyticsGoals'
import type { PlatformStats, RevenueStats } from './types'
import { ChartCard, SectionLabel } from './ui'

export function RevenueSection({ revenueStats, platformStats }: {
  revenueStats: RevenueStats
  platformStats: PlatformStats
}) {
  const netNewTrend = platformStats.monthly_table.map(m => ({
    label: m.label,
    value: Math.round((m.new_mrr_pence - m.churned_mrr_pence) / 100),
  }))
  const netNewTotal = netNewTrend.length ? netNewTrend[netNewTrend.length - 1].value : 0

  const quickRatio = platformStats.churned_mrr_pence > 0
    ? (platformStats.new_mrr_pence / platformStats.churned_mrr_pence)
    : platformStats.new_mrr_pence > 0 ? Infinity : null

  const coachAlarm = getCoachProAlarmState(revenueStats.coach_net_adds_monthly)
  const coachAlarmColor = HEALTH_COLORS[coachAlarm]

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <SectionLabel>Revenue</SectionLabel>
      </div>

      <div className="space-y-3">
        <ChartCard
          title="Net New MRR (6 months)"
          data={netNewTrend}
          color={netNewTotal >= 0 ? '#2d5fc4' : '#ef4444'}
          total={netNewTotal}
          valuePrefix={netNewTotal >= 0 ? '+£' : '£'}
        />

        <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>Total MRR</p>
              <p className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                £{(revenueStats.mrr_pence / 100).toFixed(2)}
              </p>
              {revenueStats.free_sub_count > 0 && (
                <p className="text-xs mt-1" style={{ color: '#3a4055' }}>
                  {revenueStats.free_sub_count} complimentary {revenueStats.free_sub_count === 1 ? 'plan' : 'plans'} excluded
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>Quick Ratio</p>
              <p className="text-2xl font-black leading-none"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: quickRatio == null ? '#8892aa' : quickRatio >= 1 ? '#2d5fc4' : '#ef4444' }}>
                {quickRatio == null ? '—' : quickRatio === Infinity ? '∞' : quickRatio.toFixed(1) + 'x'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#8892aa' }}>new ÷ churned MRR</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Player Premium</p>
              <p className="text-xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                {revenueStats.player_subs}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(revenueStats.player_mrr_pence / 100).toFixed(2)}/mo</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${coachAlarmColor}55` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Coach Pro</p>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: coachAlarmColor }} />
              </div>
              <p className="text-xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                {revenueStats.coach_subs}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(revenueStats.coach_mrr_pence / 100).toFixed(2)}/mo</p>
            </div>
          </div>

          {/* Legacy upgrade — always shown, honest zero-state included */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
            style={{
              backgroundColor: platformStats.legacy_count > 0 ? 'rgba(245,158,11,0.06)' : '#0a0a0a',
              border: `1px solid ${platformStats.legacy_count > 0 ? 'rgba(245,158,11,0.18)' : '#1e2235'}`,
            }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: platformStats.legacy_count > 0 ? '#f59e0b' : '#8892aa' }}>
                Legacy upgrade opportunity
              </p>
              <p className="text-xs" style={{ color: '#8892aa' }}>
                {platformStats.legacy_count > 0 ? `${platformStats.legacy_count} users on old pricing` : 'No legacy pricing left'}
              </p>
            </div>
            {platformStats.legacy_count > 0 && (
              <p className="text-sm font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#f59e0b' }}>
                +£{(platformStats.legacy_upgrade_pence / 100).toFixed(2)}/mo
              </p>
            )}
          </div>

          {platformStats.funnel.approved > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs" style={{ color: '#8892aa' }}>
                  Premium conversion
                  {revenueStats.non_converting_count > 0 && (
                    <span style={{ color: '#3a4055' }}> · {revenueStats.non_converting_count} approved users not yet subscribed</span>
                  )}
                </p>
                <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                  {Math.round((revenueStats.active_subs / platformStats.funnel.approved) * 100)}%
                </p>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
                <div className="h-1.5 rounded-full" style={{
                  width: `${Math.round((revenueStats.active_subs / platformStats.funnel.approved) * 100)}%`,
                  backgroundColor: '#f59e0b',
                }} />
              </div>
            </div>
          )}

          {revenueStats.price_breakdown.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#8892aa' }}>Pricing Tiers</p>
              <div className="space-y-1.5">
                {revenueStats.price_breakdown.map((tier) => {
                  const amount = tier.unit_amount_pence / 100
                  const isLegacy = tier.unit_amount_pence < 699
                  const label = isLegacy
                    ? `Legacy (£${amount.toFixed(2)})`
                    : tier.unit_amount_pence >= 999
                      ? `Coach Pro (£${amount.toFixed(2)})`
                      : `Player Premium (£${amount.toFixed(2)})`
                  const color = isLegacy ? '#8892aa' : tier.unit_amount_pence >= 999 ? '#a78bfa' : '#2d5fc4'
                  return (
                    <div key={tier.price_id} className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color }}>{label}</span>
                        {isLegacy && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                            style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa' }}>
                            Legacy
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
                          {tier.subscriber_count}
                        </span>
                        <span className="text-xs ml-1.5" style={{ color: '#8892aa' }}>· £{(tier.mrr_pence / 100).toFixed(2)}/mo</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
