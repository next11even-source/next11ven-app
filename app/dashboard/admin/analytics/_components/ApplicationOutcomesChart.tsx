'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { OutcomeMonth } from './types'
import { SectionLabel } from './ui'
import { filterFromLaunch, CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_GRID_COLOR, CHART_TICK_STYLE } from './chartConfig'

// Colour doctrine (lib/applicationResponse.ts + CLAUDE.md):
//   accepted  → blue  — a coach made a positive call
//   rejected  → grey  — a coach made a negative call (a HUMAN decided)
//   closed    → amber — nobody decided; the platform resolved it
const OUTCOME_COLORS = {
  accepted: '#2d5fc4',
  rejected: '#8892aa',
  closed:   '#f59e0b',
}

export function ApplicationOutcomesChart({ data }: { data: OutcomeMonth[] }) {
  const rows = filterFromLaunch(data)
  if (rows.length < 2) return null

  const total = data.reduce((s, m) => s + m.accepted + m.rejected + m.closed, 0)
  const closedTotal = data.reduce((s, m) => s + m.closed, 0)
  const closedPct = total > 0 ? Math.round(closedTotal * 100 / total) : 0

  return (
    <section>
      <SectionLabel>Application Outcomes</SectionLabel>
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>

        {/* Lifetime stat callout — the platform-health number worth watching */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: OUTCOME_COLORS.accepted }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Accepted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: OUTCOME_COLORS.rejected }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Rejected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block w-4 rounded" style={{ height: 2, backgroundColor: OUTCOME_COLORS.closed }} />
            <span className="text-xs" style={{ color: '#8892aa' }}>Closed without decision</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} cursor={{ fill: 'rgba(45,95,196,0.06)' }} />
            <Bar dataKey="accepted" name="Accepted"              stackId="a" fill={OUTCOME_COLORS.accepted} radius={[0, 0, 0, 0]} />
            <Bar dataKey="rejected" name="Rejected"              stackId="a" fill={OUTCOME_COLORS.rejected} radius={[0, 0, 0, 0]} />
            <Bar dataKey="closed"   name="Closed without decision" stackId="a" fill={OUTCOME_COLORS.closed}   radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Lifetime closed% — the platform health number this chart exists to track */}
        {total > 0 && (
          <p className="text-xs mt-3 pt-3" style={{ color: '#8892aa', borderTop: '1px solid #1e2235' }}>
            <span className="font-bold" style={{ color: closedPct >= 50 ? '#f59e0b' : '#e8dece' }}>
              {closedPct}%
            </span>
            {' '}of all {total} resolved applications closed without a coach decision — target is for this to fall as application-nudge pressure increases.
          </p>
        )}
      </div>
    </section>
  )
}
