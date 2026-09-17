'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE,
} from './chartConfig'
import { SectionLabel, LoadingCard } from './ui'

type Window = '7d' | '28d' | '6m' | '1y'

const WINDOWS: { value: Window; label: string }[] = [
  { value: '7d',  label: 'Last 7 days' },
  { value: '28d', label: 'Last 28 days' },
  { value: '6m',  label: 'Last 6 months' },
  { value: '1y',  label: 'Last year' },
]

type Bucket = { bucket: string; players: number; coaches: number }

const PLAYER_COLOR = '#2d5fc4'
const COACH_COLOR  = '#f59e0b'

export function DailyActiveUsersChart() {
  const [window, setWindow] = useState<Window>('7d')
  const [data, setData]     = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/daily-active-users?window=${window}`)
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then((d: Bucket[]) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [window])

  const isEmpty = !loading && data.every(b => b.players === 0 && b.coaches === 0)

  return (
    <section>
      <SectionLabel>Daily Active Users</SectionLabel>
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
      >
        {/* Header row: legend left, window picker right */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: PLAYER_COLOR }}
              />
              <span className="text-xs" style={{ color: '#8892aa' }}>Players</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: COACH_COLOR }}
              />
              <span className="text-xs" style={{ color: '#8892aa' }}>Coaches</span>
            </div>
          </div>
          <select
            value={window}
            onChange={e => setWindow(e.target.value as Window)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none appearance-none cursor-pointer"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
          >
            {WINDOWS.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center" style={{ height: 180 }}>
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }}
            />
          </div>
        ) : isEmpty ? (
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ height: 180, backgroundColor: '#0a0a0a' }}
          >
            <p className="text-xs" style={{ color: '#8892aa' }}>No activity in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={CHART_TICK_STYLE}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={CHART_TICK_STYLE}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_LABEL_STYLE}
                cursor={{ fill: 'rgba(42,49,80,0.4)' }}
              />
              <Bar
                dataKey="players"
                name="Players"
                stackId="a"
                fill={PLAYER_COLOR}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="coaches"
                name="Coaches"
                stackId="a"
                fill={COACH_COLOR}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
