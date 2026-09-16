'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthRow } from './types'
import { SectionLabel } from './ui'
import { filterFromLaunch, CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE } from './chartConfig'

export function EngagementChart({ monthly }: { monthly: MonthRow[] }) {
  const rows = filterFromLaunch(monthly)
  if (rows.length < 2) return null

  const data = rows.map(m => ({
    label: m.label,
    messages: m.messages,
    connections: m.connections_started,
  }))

  return (
    <section>
      <SectionLabel>Engagement</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: '#a78bfa' }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Messages</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: '#2dd4bf' }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Connections</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} cursor={{ stroke: '#2a3150' }} />
            <Line type="monotone" dataKey="messages" name="Messages" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#a78bfa' }} />
            <Line type="monotone" dataKey="connections" name="Connections" stroke="#2dd4bf" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#2dd4bf' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
