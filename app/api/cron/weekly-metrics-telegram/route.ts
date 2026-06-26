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
  const cur = metrics as Metrics

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
