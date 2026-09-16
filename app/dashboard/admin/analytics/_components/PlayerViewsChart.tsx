'use client'

import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { SectionLabel } from './ui'
import { CHART_TOOLTIP_STYLE } from './chartConfig'

export type PlayerViewsMonth = {
  label: string
  views: number
  view_to_message_pct: number | null
}

export function PlayerViewsChart({ data }: { data: PlayerViewsMonth[] }) {
  if (data.length < 2) return null

  const chartData = data.map(d => ({
    label: d.label,
    views: d.views,
    rate: d.view_to_message_pct ?? 0,
  }))

  return (
    <section>
      <SectionLabel>Coach Browsing — Views &amp; Conversion</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-xs mb-3" style={{ color: '#3a4055' }}>
          Coach profile views per month · right axis = % that messaged within 7 days
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#8892aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            {/* Left axis: view count */}
            <YAxis
              yAxisId="left"
              tick={{ fill: '#8892aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            {/* Right axis: conversion % */}
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 50]}
              tickFormatter={v => `${v}%`}
              tick={{ fill: '#8892aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => {
                if (name === 'views') return [`${value as number} views`, 'Coach views']
                return [`${value as number}%`, '→ messaged within 7d']
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="views"
              fill="#2d5fc4"
              opacity={0.45}
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              dataKey="rate"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Current-month summary stat */}
        {(() => {
          const latest = chartData[chartData.length - 1]
          return (
            <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #1e2235' }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm flex-shrink-0 opacity-60" style={{ backgroundColor: '#2d5fc4' }} />
                <span className="text-xs" style={{ color: '#8892aa' }}>
                  {latest.views} views this month
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#a78bfa' }} />
                <span className="text-xs" style={{ color: '#8892aa' }}>
                  {latest.rate}% messaged within 7d
                </span>
              </div>
            </div>
          )
        })()}
      </div>
    </section>
  )
}
