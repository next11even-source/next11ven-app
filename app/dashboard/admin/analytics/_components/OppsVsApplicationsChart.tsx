'use client'

import { useState, useMemo } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList,
} from 'recharts'
import type { MonthRow } from './types'
import { SectionLabel, WindowSelect } from './ui'
import {
  filterFromLaunch, sliceWindow,
  CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE,
  type MonthWindow,
} from './chartConfig'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isCurrentMonth(label: string): boolean {
  const now = new Date()
  const m = MONTHS[now.getMonth()]
  const y = String(now.getFullYear()).slice(2)
  return label === `${m} ${y}`
}

function formatRevLabel(pence: number, inProgress: boolean): string {
  if (pence === 0 && !inProgress) return ''
  const pounds = pence / 100
  const s = pounds >= 1000 ? `£${(pounds / 1000).toFixed(1)}k` : `£${pounds.toFixed(0)}`
  return inProgress ? `${s}~` : s
}

function formatRevTooltip(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

/**
 * Grouped bar chart: opportunities posted, applications, and messages per month.
 * Revenue is shown as a label above each month group (not a line, so it doesn't
 * skew the activity axis). Current month revenue is suffixed with ~ (month-to-date).
 */
export function OppsVsApplicationsChart({ monthly }: { monthly: MonthRow[] }) {
  const [win, setWin] = useState<MonthWindow>('all')

  const allRows = filterFromLaunch(monthly)
  const rows = sliceWindow(allRows, win)
  if (allRows.length < 2) return null

  // _top = 1 on a [0,1] secondary axis → invisible bar always fills to the chart top,
  // giving LabelList a fixed anchor point for the revenue label.
  const data = useMemo(() => rows.map(m => {
    const current = isCurrentMonth(m.label)
    return {
      label: m.label,
      'Opps posted': m.opportunities_posted,
      'Applications': m.applications,
      'Messages': m.messages,
      // Revenue in pence — kept in data for tooltip; LabelList reads _revLabel
      _revPence: m.real_revenue_pence,
      _revLabel: formatRevLabel(m.real_revenue_pence, current),
      _top: 1,
      _current: current,
    }
  }), [rows])

  return (
    <section>
      <SectionLabel>Activity vs Revenue</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Do high-activity months drive revenue? Revenue shown above each month — ~ means month-to-date.
          </p>
          <WindowSelect value={win} onChange={setWin} />
        </div>
        <p className="text-xs mb-4" style={{ color: '#8892aa' }}>
          Opps posted = roles created · Applications = players applying · Messages = sends
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -16 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            {/* Left axis: activity counts */}
            <YAxis
              yAxisId="left"
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={24}
            />
            {/* Right axis: hidden — anchors the full-height invisible bar for revenue labels */}
            <YAxis
              yAxisId="rev"
              orientation="right"
              domain={[0, 1]}
              hide
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_LABEL_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(value, name) => {
                if (name === '_top' || name === '_revPence') return null
                return [value, name]
              }}
              // Surface revenue as a clean extra row
              content={({ active, payload, label: ttLabel }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div style={{ ...CHART_TOOLTIP_STYLE, padding: '8px 12px' }}>
                    <p style={{ ...CHART_LABEL_STYLE, marginBottom: 6 }}>{ttLabel}</p>
                    {payload
                      .filter(p => p.dataKey !== '_top' && p.dataKey !== '_revPence')
                      .map(p => (
                        <div key={String(p.dataKey)} className="flex items-center justify-between gap-6" style={{ marginBottom: 2 }}>
                          <span style={{ color: '#8892aa', fontSize: 11 }}>{p.name}</span>
                          <span style={{ color: '#e8dece', fontSize: 11, fontWeight: 600 }}>{p.value}</span>
                        </div>
                      ))
                    }
                    {d?._revPence !== undefined && (
                      <div className="flex items-center justify-between gap-6 mt-2 pt-2" style={{ borderTop: '1px solid #1e2235' }}>
                        <span style={{ color: '#8892aa', fontSize: 11 }}>Revenue{d._current ? ' (mtd)' : ''}</span>
                        <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 600 }}>{formatRevTooltip(d._revPence)}</span>
                      </div>
                    )}
                  </div>
                )
              }}
            />
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: '#8892aa', paddingTop: 8 }}
              formatter={(value) => value === '_top' ? null : value}
            />
            <Bar yAxisId="left" dataKey="Opps posted" fill="#2d5fc4" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="Applications" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="Messages" fill="#38bdf8" radius={[3, 3, 0, 0]} />
            {/* Invisible full-height bar — revenue labels anchor here at the chart top */}
            <Bar
              yAxisId="rev"
              dataKey="_top"
              fill="transparent"
              stroke="none"
              barSize={1}
              legendType="none"
              isAnimationActive={false}
            >
              <LabelList
                dataKey="_revLabel"
                position="insideTop"
                style={{ fontSize: 10, fontWeight: 700, fill: '#22c55e' }}
                offset={4}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
