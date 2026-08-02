import type { HealthState } from '@/lib/analyticsGoals'
import { HEALTH_COLORS, MRR_GOAL_PENCE, getMrrGoalProgress } from '@/lib/analyticsGoals'
import { buildNarrative } from './narrative'
import { Sparkline, type DayPoint } from './ui'
import type { MonthRow } from './types'

export function NarrativeBanner({ monthly }: { monthly: MonthRow[] }) {
  const line = buildNarrative(monthly)
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <p className="text-sm font-semibold leading-snug" style={{ color: '#e8dece' }}>{line}</p>
    </div>
  )
}

export function HeroMetricCard({ label, value, deltaLabel, sparkline, sparklineColor, state, footnote }: {
  label: string
  value: string
  deltaLabel?: string
  sparkline?: DayPoint[]
  sparklineColor?: string
  state?: HealthState
  footnote?: string
}) {
  const stateColor = state ? HEALTH_COLORS[state] : undefined
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1.5"
      style={{
        backgroundColor: '#13172a',
        border: '1px solid #1e2235',
        borderLeft: stateColor ? `3px solid ${stateColor}` : undefined,
      }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider leading-tight" style={{ color: '#8892aa', fontSize: 10 }}>
          {label}
        </span>
        {state && (
          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: stateColor }} />
        )}
      </div>
      <span className="text-3xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        {value}
      </span>
      <div className="flex items-end justify-between gap-2 min-h-[32px]">
        <div className="space-y-0.5">
          {deltaLabel && <p className="text-xs font-bold" style={{ color: stateColor ?? '#8892aa' }}>{deltaLabel}</p>}
          {footnote && <p className="text-xs" style={{ color: '#8892aa' }}>{footnote}</p>}
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={sparklineColor ?? '#2d5fc4'} />}
      </div>
    </div>
  )
}

export function ProgressToGoalCard({ currentMrrPence, paceActualPencePerMonth }: {
  currentMrrPence: number
  paceActualPencePerMonth: number
}) {
  const progress = getMrrGoalProgress(currentMrrPence, paceActualPencePerMonth)
  const color = HEALTH_COLORS[progress.state]
  const monthsLabel = progress.monthsRemaining < 1
    ? '<1 month left'
    : `${Math.ceil(progress.monthsRemaining)} months left`

  return (
    <div className="rounded-xl p-4 flex flex-col gap-1.5"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider leading-tight" style={{ color: '#8892aa', fontSize: 10 }}>
          Progress to £500 MRR
        </span>
        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
      </div>
      <span className="text-3xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        £{(currentMrrPence / 100).toFixed(0)} <span style={{ color: '#8892aa', fontSize: '0.5em' }}>/ £{(MRR_GOAL_PENCE / 100).toFixed(0)}</span>
      </span>
      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${progress.progressPct}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs" style={{ color: '#8892aa' }}>
        {monthsLabel} · need <span style={{ color: '#e8dece', fontWeight: 700 }}>£{(progress.paceNeededPencePerMonth / 100).toFixed(0)}/mo</span> net,
        {' '}running <span style={{ color, fontWeight: 700 }}>£{(progress.paceActualPencePerMonth / 100).toFixed(0)}/mo</span>
      </p>
    </div>
  )
}
