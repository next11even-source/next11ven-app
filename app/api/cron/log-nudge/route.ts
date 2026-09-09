import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendLogNudgeEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'
import {
  performanceTrackerEnabled,
  likelyMatchWeekday,
  mostRecentWeekday,
} from '@/lib/performance'

export const runtime = 'nodejs'
export const maxDuration = 60

// Post-match log nudge — the flywheel's intake valve. Runs daily at 18:00 UTC;
// for each player with an ACTIVE club stint whose likely match day is TODAY
// (derived from the weekday they usually log on, Saturday until there's history)
// and who hasn't logged that game, sends one gentle "log it" reminder the evening
// of the match while it's fresh. Email only — respects email_marketing_opt_out.
//
// Free feature, no upsell.

const DAY = 86_400_000

type Candidate = {
  id: string
  email: string | null
  full_name: string | null
  email_marketing_opt_out: boolean | null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Don't nudge for a feature that's globally dark.
  if (!performanceTrackerEnabled()) {
    return NextResponse.json({ skipped: 'tracker disabled' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Players currently at a club (active stint) — the audience that's playing and
  // in the logging habit.
  const { data: stints, error: stintErr } = await supabase
    .from('club_stints')
    .select('player_id')
    .is('end_date', null)

  if (stintErr) {
    reportError('/api/cron/log-nudge', stintErr, 'failed to load active stints')
    return NextResponse.json({ error: 'Failed to load stints' }, { status: 500 })
  }

  const playerIds = [...new Set((stints ?? []).map(s => s.player_id))]
  if (playerIds.length === 0) return NextResponse.json({ nudged: 0, reason: 'no active stints' })

  const [{ data: profiles, error: profErr }, { data: matches, error: matchErr }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, email_marketing_opt_out, approved, role')
      .in('id', playerIds)
      .eq('approved', true)
      .in('role', ['player', 'admin']),
    supabase
      .from('performance_matches')
      .select('player_id, match_date')
      .in('player_id', playerIds),
  ])

  if (profErr || matchErr) {
    reportError('/api/cron/log-nudge', profErr ?? matchErr, 'failed to load profiles/matches')
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 })
  }

  // Per-player match dates.
  const datesByPlayer = new Map<string, string[]>()
  for (const m of matches ?? []) {
    const arr = datesByPlayer.get(m.player_id) ?? []
    arr.push(m.match_date)
    datesByPlayer.set(m.player_id, arr)
  }

  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  let nudgedEmail = 0
  let skipped = 0
  let failed = 0

  for (const p of (profiles ?? []) as (Candidate & { approved: boolean; role: string })[]) {
    try {
      const dates = datesByPlayer.get(p.id) ?? []
      const weekday = likelyMatchWeekday(dates) ?? 6 // Saturday default
      const occurrence = mostRecentWeekday(weekday, now)

      // Nudge the EVENING of the likely match day — this cron runs 18:00 UTC
      // (≈6pm in-season / 7pm summer), after a 3pm kickoff, while the game is
      // fresh. daysSince 0 = today is that match day.
      const daysSince = Math.round((todayUtc - Date.parse(`${occurrence}T00:00:00Z`)) / DAY)
      if (daysSince !== 0) { skipped++; continue }

      // Already logged that game (or something later)? Nothing to nudge.
      if (dates.some(d => d >= occurrence)) { skipped++; continue }

      // ── Email nudge (SMS removed: free-feature flywheel, email sufficient) ──
      if (p.email && p.email_marketing_opt_out !== true) {
        await sendLogNudgeEmail({ to: p.email, toName: p.full_name, playerId: p.id })
        nudgedEmail++
      } else {
        skipped++
      }
    } catch (err) {
      reportError('/api/cron/log-nudge', err, `nudge failed for player ${p.id}`)
      failed++
    }
  }

  return NextResponse.json({
    candidates: (profiles ?? []).length,
    nudgedEmail,
    skipped,
    failed,
  })
}
