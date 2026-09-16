'use client'

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { MonthRow } from './types'
import { SectionLabel } from './ui'
import { filterFromLaunch, CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE } from './chartConfig'

/**
 * Correlation chart: messages sent (bars, left axis) + opportunities posted
 * and new Pro conversions (lines, right axis) per month.
 *
 * Purpose: see whether coach activity (messages), supply (opps), and revenue
 * (new Pro subs) move together. A month where messaging drops but opps hold
 * means coaches are posting and ghosting — not using the platform.
 * A month where both dip and pro conversions dip with them confirms supply
 * constraint is the conversion blocker.
 *
 * Bars for messages (bigger numbers, dominant shape), lines for opps + pro
 * (both small enough to share the right axis cleanly).
 */
export function PlatformMomentumChart({ monthly }: { monthly: MonthRow[] }) {
  const rows = filterFromLaunch(monthly)
  if (rows.length < 2) return null

  const data = rows.map(m => ({
    label: m.label,
    'Messages': m.messages,
    'Opps posted': m.opportunities_posted,
    'New Pro': m.new_premium,
  }))

  return (
    <section>
      <SectionLabel>Platform Momentum — Correlation View</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-xs mb-4" style={{ color: '#8892aa' }}>
          Messages (bars) · Opportunities posted · New Pro conversions — watch whether these move together month to month.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 4, right: 28, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            {/* Left axis: messages (hundreds) */}
            <YAxis
              yAxisId="left"
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={24}
            />
            {/* Right axis: opps + pro (tens) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={24}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: '#8892aa', paddingTop: 8 }}
            />
            <Bar yAxisId="left" dataKey="Messages" fill="#38bdf8" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="Opps posted" stroke="#fb923c" strokeWidth={2} dot={{ r: 3, fill: '#fb923c' }} activeDot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="New Pro" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: '#a78bfa' }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs mt-3" style={{ color: '#8892aa' }}>
          Left axis: messages · Right axis: opps &amp; Pro conversions
        </p>
      </div>
    </section>
  )
}
