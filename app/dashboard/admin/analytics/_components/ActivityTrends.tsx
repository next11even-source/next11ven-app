'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthRow } from './types'
import { SectionLabel } from './ui'
import { filterFromLaunch, CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE } from './chartConfig'

export function ActivityTrends({ monthly }: { monthly: MonthRow[] }) {
  const rows = filterFromLaunch(monthly)
  if (rows.length < 2) return null

  const data = rows.map(m => ({
    label: m.label,
    applications: m.applications,
    opportunities: m.opportunities_posted,
  }))

  return (
    <section>
      <SectionLabel>Recruitment Activity</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: '#60a5fa' }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Applications</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: '#fb923c' }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Opportunities</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} cursor={{ stroke: '#2a3150' }} />
            <Line type="monotone" dataKey="applications" name="Applications" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#60a5fa' }} />
            <Line type="monotone" dataKey="opportunities" name="Opportunities" stroke="#fb923c" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#fb923c' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
