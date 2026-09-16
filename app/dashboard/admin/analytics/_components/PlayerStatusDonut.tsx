'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { SectionLabel } from './ui'
import { CHART_TOOLTIP_STYLE } from './chartConfig'

type StatusCount = { status: string; count: number; pct: number }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  free_agent:    { label: 'Free Agent',    color: '#60a5fa' },
  just_exploring:{ label: 'Just Exploring',color: '#8892aa' },
  signed:        { label: 'Signed',        color: '#2d5fc4' },
  loan_dual_reg: { label: 'Loan / Dual',   color: '#f59e0b' },
}

function statusLabel(s: string) { return STATUS_CONFIG[s]?.label ?? s }
function statusColor(s: string) { return STATUS_CONFIG[s]?.color ?? '#3a4055' }

export function PlayerStatusDonut({
  distribution,
  total,
}: {
  distribution: StatusCount[]
  total: number
}) {
  if (!distribution.length) return null

  const chartData = distribution.map(d => ({
    name: statusLabel(d.status),
    value: d.count,
    pct: d.pct,
    color: statusColor(d.status),
  }))

  return (
    <section>
      <SectionLabel>Player Status Distribution</SectionLabel>
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-4">
          {/* Donut */}
          <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={54}
                  strokeWidth={0}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: unknown, name: unknown) => [
                    `${v as number} players`,
                    name as string,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Centre label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-black leading-none"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                {total}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>players</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {distribution.map(d => (
              <div key={d.status} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusColor(d.status) }} />
                  <span className="text-xs truncate" style={{ color: '#8892aa' }}>
                    {statusLabel(d.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs tabular-nums font-semibold" style={{ color: '#e8dece' }}>
                    {d.count}
                  </span>
                  <span className="text-xs tabular-nums w-8 text-right" style={{ color: '#3a4055' }}>
                    {d.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proportional bar */}
        <div className="flex rounded-full overflow-hidden h-1.5">
          {distribution.map(d => (
            <div
              key={d.status}
              style={{ width: `${d.pct}%`, backgroundColor: statusColor(d.status) }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
