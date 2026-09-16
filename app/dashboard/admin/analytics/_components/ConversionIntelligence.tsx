'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import type { ConversionIntelligence as ConversionIntelligenceData, TimeToUpgrade } from './types'
import { SectionLabel } from './ui'
import { CHART_TOOLTIP_STYLE, CHART_LABEL_STYLE, CHART_TICK_STYLE } from './chartConfig'

const TOUCHPOINT_LABELS: Record<string, string> = {
  actively_looking_toggle: 'Actively Looking toggle',
  apply_gate: 'Apply gate',
  match_paywall: 'Match score paywall',
  message_read_paywall: 'Locked message',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function TimeToUpgradeCard({ data }: { data: TimeToUpgrade }) {
  if (data.total === 0) {
    return (
      <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-sm font-bold mb-1" style={{ color: '#e8dece' }}>Time from signup to upgrade</p>
        <p className="text-xs" style={{ color: '#8892aa' }}>No upgrades yet.</p>
      </div>
    )
  }

  const buckets = [
    { label: 'Same day', value: data.same_day },
    { label: 'Within a week', value: data.within_week },
    { label: 'Within a month', value: data.within_month },
    { label: 'Longer', value: data.longer },
  ]

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Time from signup to upgrade</p>
        <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
          {data.avg_days !== null ? `${data.avg_days}d avg` : '—'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart
          data={buckets}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 0, left: 4 }}
          barSize={14}
        >
          <XAxis type="number" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={80} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_LABEL_STYLE}
            cursor={{ fill: 'rgba(45,95,196,0.08)' }}
          />
          <Bar dataKey="value" name="Users" radius={[0, 3, 3, 0]}>
            {buckets.map((b, i) => (
              <Cell key={b.label} fill={i === 0 ? '#22c55e' : i === 1 ? '#2d5fc4' : i === 2 ? '#f59e0b' : '#8892aa'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs" style={{ color: '#8892aa' }}>
        {data.total} upgrade{data.total === 1 ? '' : 's'} total — same-day = impulse, weeks-later = considered.
      </p>
    </div>
  )
}

function CalibratingCard({ calibration }: { calibration: ConversionIntelligenceData['calibration'] }) {
  const { started_at, days_elapsed, days_required } = calibration
  const pct = started_at && days_elapsed !== null ? Math.min(100, Math.round((days_elapsed / days_required) * 100)) : 0

  return (
    <div className="rounded-xl p-4 space-y-2.5" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Paywall → upgrade attribution</p>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          Calibrating
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
        Once ready, this shows which action a free user took right before upgrading —
        hit the message paywall, toggled Actively Looking, hit the apply gate, or saw a
        locked match score — so you know where to add or remove friction. A user can
        show up under more than one touchpoint if they hit several before converting.
      </p>
      {started_at && days_elapsed !== null ? (
        <>
          <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#f59e0b' }} />
          </div>
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Collecting since {formatDate(started_at)} — day {days_elapsed} of {days_required}
          </p>
        </>
      ) : (
        <p className="text-xs" style={{ color: '#8892aa' }}>
          Not started yet — waiting on the first real paywall view.
        </p>
      )}
    </div>
  )
}

function TouchpointBreakdownCard({ touchpoints }: { touchpoints: ConversionIntelligenceData['touchpoints'] }) {
  return (
    <div className="rounded-xl p-4 space-y-2.5" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Paywall → upgrade attribution</p>
      {touchpoints.length === 0 ? (
        <p className="text-xs" style={{ color: '#8892aa' }}>No paywall views logged yet.</p>
      ) : (
        <div className="space-y-2">
          {touchpoints.map(t => (
            <div key={t.touchpoint} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#8892aa' }}>
                {TOUCHPOINT_LABELS[t.touchpoint] ?? t.touchpoint}
              </span>
              <span className="text-xs font-bold" style={{ color: '#e8dece' }}>
                {t.converted}/{t.shown}
                {t.conversion_rate_pct !== null && <span style={{ color: '#2d5fc4' }}> · {t.conversion_rate_pct}%</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Layer 3 — conversion intelligence. time-to-upgrade ships live (computed
 * from existing profiles/subscriptions data, no calibration gap). Touchpoint
 * attribution is gated behind a self-calibrating window — see the migration
 * comment for why it's based on the first real logged row, not a fixed date.
 */
export function ConversionIntelligenceSection({ data, timeToUpgrade }: {
  data: ConversionIntelligenceData
  timeToUpgrade: TimeToUpgrade
}) {
  return (
    <section>
      <SectionLabel>Conversion Intelligence</SectionLabel>
      <div className="space-y-2.5">
        <TimeToUpgradeCard data={timeToUpgrade} />
        {data.calibration.ready
          ? <TouchpointBreakdownCard touchpoints={data.touchpoints} />
          : <CalibratingCard calibration={data.calibration} />}
      </div>
    </section>
  )
}
