'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { HEALTH_COLORS, getCoachProAlarmState } from '@/lib/analyticsGoals'
import type { PlatformStats, RevenueStats } from './types'
import { ChartCard, SectionLabel } from './ui'
import { CHART_TOOLTIP_STYLE } from './chartConfig'

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
          title={`Net New MRR (${netNewTrend.length} ${netNewTrend.length === 1 ? 'month' : 'months'})`}
          data={netNewTrend}
          color={netNewTotal >= 0 ? '#22c55e' : '#ef4444'}
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
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: quickRatio == null ? '#8892aa' : quickRatio >= 1 ? '#22c55e' : '#ef4444' }}>
                {quickRatio == null ? '—' : quickRatio === Infinity ? '∞' : quickRatio.toFixed(1) + 'x'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#8892aa' }}>new ÷ churned MRR</p>
            </div>
          </div>

          {/* MRR split donut */}
          {(revenueStats.player_mrr_pence > 0 || revenueStats.coach_mrr_pence > 0) ? (
            <div>
              <div className="relative">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Player Pro', value: revenueStats.player_mrr_pence },
                        { name: 'Coach Pro', value: revenueStats.coach_mrr_pence },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      strokeWidth={0}
                      dataKey="value"
                    >
                      <Cell fill="#2d5fc4" />
                      <Cell fill={coachAlarmColor} />
                    </Pie>
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(v: unknown) => [`£${((v as number) / 100).toFixed(2)}/mo`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                    {revenueStats.active_subs}
                  </span>
                  <span className="text-xs" style={{ color: '#8892aa' }}>subs</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#2d5fc4' }} />
                    <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Player Pro</p>
                  </div>
                  <p className="text-lg font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                    {revenueStats.player_subs}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(revenueStats.player_mrr_pence / 100).toFixed(2)}/mo</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: '#0a0a0a', border: `1px solid ${coachAlarmColor}55` }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: coachAlarmColor }} />
                    <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Coach Pro</p>
                  </div>
                  <p className="text-lg font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: coachAlarmColor }}>
                    {revenueStats.coach_subs}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(revenueStats.coach_mrr_pence / 100).toFixed(2)}/mo</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Player Pro</p>
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
          )}

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
                  Pro conversion
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

        </div>
      </div>
    </section>
  )
}
