'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { MonthRow } from './types'
import { SectionLabel, WindowSelect } from './ui'
import {
  filterFromLaunch, sliceWindow,
  CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE,
  type MonthWindow,
} from './chartConfig'

/**
 * Grouped bar chart: opportunities posted vs applications submitted per month.
 * Shows whether the supply side (roles) and demand side (applications) are
 * moving together — a widening gap either way is a signal.
 */
export function OppsVsApplicationsChart({ monthly }: { monthly: MonthRow[] }) {
  const [win, setWin] = useState<MonthWindow>('all')

  const allRows = filterFromLaunch(monthly)
  const rows = sliceWindow(allRows, win)
  if (allRows.length < 2) return null

  const data = rows.map(m => ({
    label: m.label,
    'Opps posted': m.opportunities_posted,
    'Applications': m.applications,
  }))

  return (
    <section>
      <SectionLabel>Opportunities vs Applications</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Supply vs demand — a widening gap signals imbalance.
          </p>
          <WindowSelect value={win} onChange={setWin} />
        </div>
        <p className="text-xs mb-4" style={{ color: '#8892aa' }}>
          Opps posted = roles created by coaches · Applications = players applying to those roles
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: '#8892aa', paddingTop: 8 }}
            />
            <Bar dataKey="Opps posted" fill="#2d5fc4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Applications" fill="#a78bfa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
