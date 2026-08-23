import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram'
import { buildReport, type Metrics } from '@/lib/weeklyReport'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Compute this week's metrics
  const { data: metrics, error: rpcError } = await supabase.rpc('analytics_weekly_snapshot')
  if (rpcError || !metrics) {
    console.error('[weekly-metrics-telegram] rpc error:', rpcError)
    reportError('/api/cron/weekly-metrics-telegram', rpcError, 'analytics_weekly_snapshot failed')
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 })
  }
  let cur = metrics as Metrics

  // Game Performance Tracker adoption — merged into the snapshot so deltas
  // carry over week to week. Non-fatal if it fails.
  const { data: trackerStats, error: trackerError } = await supabase.rpc('tracker_weekly_stats')
  if (trackerError) {
    console.error('[weekly-metrics-telegram] tracker stats error:', trackerError)
    reportError('/api/cron/weekly-metrics-telegram', trackerError, 'tracker_weekly_stats failed')
  } else if (trackerStats) {
    cur = { ...cur, ...(trackerStats as Metrics) }
  }

  // Time-to-upgrade — pulled from analytics_revenue_stats() (same source the
  // admin dashboard's ConversionIntelligence card reads) rather than a new
  // function. It's a lifetime distribution, not a 7d flow, so it's flattened
  // in under a ttu_ prefix and rendered without week-over-week deltas.
  // Non-fatal if it fails.
  const { data: revenueStats, error: revenueError } = await supabase.rpc('analytics_revenue_stats')
  if (revenueError) {
    console.error('[weekly-metrics-telegram] revenue stats error:', revenueError)
    reportError('/api/cron/weekly-metrics-telegram', revenueError, 'analytics_revenue_stats failed')
  } else if (revenueStats && (revenueStats as { time_to_upgrade?: Record<string, number | null> }).time_to_upgrade) {
    const ttu = (revenueStats as { time_to_upgrade: Record<string, number | null> }).time_to_upgrade
    cur = {
      ...cur,
      ttu_avg_days: ttu.avg_days,
      ttu_same_day: ttu.same_day,
      ttu_within_week: ttu.within_week,
      ttu_within_month: ttu.within_month,
      ttu_longer: ttu.longer,
      ttu_total: ttu.total,
    }
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // 2. Fetch the most recent prior snapshot (strictly before today) for deltas
  const { data: priorRows, error: priorError } = await supabase
    .from('weekly_metrics_snapshot')
    .select('snapshot_date, metrics')
    .lt('snapshot_date', today)
    .order('snapshot_date', { ascending: false })
    .limit(1)

  if (priorError) {
    console.error('[weekly-metrics-telegram] prior fetch error:', priorError)
    reportError('/api/cron/weekly-metrics-telegram', priorError, 'failed to read prior snapshot')
    // Non-fatal — continue with no comparison
  }
  const prev: Metrics | null = priorRows && priorRows.length > 0 ? (priorRows[0].metrics as Metrics) : null

  // 3. Persist this week's snapshot (idempotent on re-run within the same day)
  const { error: upsertError } = await supabase
    .from('weekly_metrics_snapshot')
    .upsert({ snapshot_date: today, metrics: cur }, { onConflict: 'snapshot_date' })

  if (upsertError) {
    console.error('[weekly-metrics-telegram] upsert error:', upsertError)
    reportError('/api/cron/weekly-metrics-telegram', upsertError, 'failed to persist snapshot')
    // Non-fatal — still send the report
  }

  // 4. Format + send
  const report = buildReport(cur, prev)
  const sent = await sendTelegramMessage(report)

  if (!sent) {
    reportError('/api/cron/weekly-metrics-telegram', 'telegram send failed', 'sendTelegramMessage returned false')
    return NextResponse.json({ ok: false, sent: false, snapshot_date: today, hadPrior: !!prev }, { status: 200 })
  }

  console.log(`[weekly-metrics-telegram] sent report for ${today} (hadPrior: ${!!prev})`)
  return NextResponse.json({ ok: true, sent: true, snapshot_date: today, hadPrior: !!prev })
}
