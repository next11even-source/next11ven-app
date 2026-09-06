import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendCoachGoneQuietD1Email, sendCoachGoneQuietD14Email } from '@/lib/email'
import { logTouch, canSendTouch } from '@/lib/touchpoint'
import { reportError } from '@/lib/alert'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'
import { getFlowSettings } from '@/lib/flowSettings'

export const runtime = 'nodejs'
export const maxDuration = 120

// Coach gone-quiet — two-step cadence targeting coaches who posted at least once
// ever but have gone silent (no new opportunity in >= 28 days). Runs weekly
// (Friday 09:00 UTC, two days after coach-activation on Wednesday).
//
// Distinct from coach-activation which only fires for zero-ever coaches. The
// separation is structural: `hasPostedEver` is a separate Set built from an
// EXISTS check, not just a recency filter, so a never-posted coach can never
// satisfy `goneQuiet = hasPostedEver AND NOT hasPostedRecently`.
//
// Step D1  — angle: demand they're missing. New approved players who joined
//            AFTER the coach's last post date — computed in bulk (one query,
//            in-memory per-coach filter by coach.lastPostedAt).
//
// Step D14 — angle: social proof — same as activation D21. If the missed-demand
//            stat didn't land, peer comparison is the next lever.
//
// After both steps: no further dedicated nudging. Two ignored emails = either
// no current need or won't reactivate from email.
//
// 28-day quiet threshold matches OPP_MAX_AGE_DAYS (existing stale-role
// definition). "Quiet" = no opportunity with created_at in the last 28 days.
// Login activity is excluded — a coach who browses but never posts is dead
// supply regardless.

const QUIET_DAYS = 28       // days without a new post to count as quiet
const D14_MIN_GAP_DAYS = 14 // days after D1 before D14 fires

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const only = url.searchParams.get('to') // single-coach test by email

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const flowEnabled = await getFlowSettings(supabase, ['coach_gone_quiet_d1', 'coach_gone_quiet_d14'])
  if (!flowEnabled.coach_gone_quiet_d1 && !flowEnabled.coach_gone_quiet_d14) {
    return NextResponse.json({ skipped: 'all flows disabled' })
  }

  // ── Opportunities — build two sets ────────────────────────────────────────
  // hasPostedEver: any opportunity, any time, any state.
  // hasPostedRecently: opportunity with created_at in the last QUIET_DAYS days.
  // Only coaches in hasPostedEver AND NOT hasPostedRecently are gone-quiet.
  //
  // We also track the most recent post date per coach so D1 can report how many
  // players joined since then. Pull all opps in one query; split in memory.
  const { data: allOpps, error: oppsErr } = await supabase
    .from('opportunities')
    .select('coach_id, created_at')

  if (oppsErr) {
    reportError('/api/cron/coach-gone-quiet', oppsErr, 'failed to load opportunities')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const quietCutoff = new Date(Date.now() - QUIET_DAYS * 86_400_000).toISOString()

  // Latest post date per coach (for new-player count in D1)
  const lastPostDate = new Map<string, string>()
  const hasPostedRecently = new Set<string>()

  for (const opp of allOpps ?? []) {
    const existing = lastPostDate.get(opp.coach_id)
    if (!existing || opp.created_at > existing) {
      lastPostDate.set(opp.coach_id, opp.created_at)
    }
    if (opp.created_at >= quietCutoff) {
      hasPostedRecently.add(opp.coach_id)
    }
  }

  // hasPostedEver = all keys in lastPostDate
  const hasPostedEver = new Set(lastPostDate.keys())

  // Coaches who have sent a message to a player within the quiet window.
  // A coach who messaged recently isn't "gone quiet" even if they haven't posted.
  const { data: recentMsgRows } = await supabase
    .from('messages')
    .select('sender_id')
    .gte('created_at', quietCutoff)
    .not('sender_id', 'is', null)

  const hasMessagedRecently = new Set(
    (recentMsgRows ?? []).map((r: { sender_id: string }) => r.sender_id).filter(Boolean)
  )

  // ── Approved coaches ───────────────────────────────────────────────────────
  const { data: coaches, error: coachErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, email_marketing_opt_out')
    .in('role', ['coach'])
    .eq('approved', true)
    .not('email', 'is', null)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)

  if (coachErr) {
    reportError('/api/cron/coach-gone-quiet', coachErr, 'failed to load coaches')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  // Gone-quiet = has posted at some point (still means they've used formal recruiting)
  // AND has not been recently active via either posting OR messaging.
  const eligible = (coaches ?? []).filter(
    (c: { id: string }) =>
      hasPostedEver.has(c.id) &&
      !hasPostedRecently.has(c.id) &&
      !hasMessagedRecently.has(c.id)
  )

  if (eligible.length === 0) {
    return NextResponse.json({ candidates: 0, sentD1: 0, sentD14: 0, skipped: 0, failed: 0 })
  }

  const eligibleIds = eligible.map((c: { id: string }) => c.id)

  // ── Touchpoint log — batch fetch both step records ─────────────────────────
  const { data: d1Log } = await supabase
    .from('touchpoint_log')
    .select('recipient_id, sent_at')
    .in('recipient_id', eligibleIds)
    .eq('flow', 'coach_gone_quiet_d1')
    .eq('channel', 'email')

  const { data: d14Log } = await supabase
    .from('touchpoint_log')
    .select('recipient_id, sent_at')
    .in('recipient_id', eligibleIds)
    .eq('flow', 'coach_gone_quiet_d14')
    .eq('channel', 'email')

  const d1SentAt = new Map((d1Log ?? []).map((r: { recipient_id: string; sent_at: string }) => [r.recipient_id, r.sent_at]))
  const d14Sent = new Set((d14Log ?? []).map((r: { recipient_id: string }) => r.recipient_id))

  // ── Platform data (queried once, shared across recipients) ─────────────────

  // Approved players by join date — for D1 new-player count per coach.
  // Matched in memory: for each coach, count players whose created_at is after
  // the coach's lastPostDate. One DB round trip, not one per coach.
  const { data: allPlayers } = await supabase
    .from('profiles')
    .select('id, created_at')
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)

  const playerList = (allPlayers ?? []) as Array<{ id: string; created_at: string }>

  // Coaches who posted a role in the last 7 days — D14 social-proof stat.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: recentPosts } = await supabase
    .from('opportunities')
    .select('coach_id')
    .gte('created_at', weekAgo)

  const coachesPostedThisWeek = new Set((recentPosts ?? []).map((r: { coach_id: string }) => r.coach_id)).size

  let sentD1 = 0, sentD14 = 0, skipped = 0, failed = 0
  const preview: Array<{ email: string | null; step: 'd1' | 'd14'; id: string; daysSinceLastPost: number }> = []

  for (const coach of eligible as Array<{
    id: string
    email: string | null
    full_name: string | null
    email_marketing_opt_out: boolean | null
  }>) {
    if (only && coach.email !== only) { skipped++; continue }
    if (coach.email_marketing_opt_out) { skipped++; continue }

    const lastPostedAt = lastPostDate.get(coach.id)!
    const daysSinceLastPost = Math.floor((Date.now() - new Date(lastPostedAt).getTime()) / 86_400_000)
    const d1At = d1SentAt.get(coach.id)
    const hasSentD1 = Boolean(d1At)
    const hasSentD14 = d14Sent.has(coach.id)

    // ── Determine which step, if any ─────────────────────────────────────────
    let step: 'd1' | 'd14' | null = null

    if (!hasSentD1) {
      // D1 fires as soon as the coach qualifies (already >= QUIET_DAYS since last post)
      step = 'd1'
    } else if (hasSentD1 && !hasSentD14 && d1At) {
      const daysSinceD1 = (Date.now() - new Date(d1At).getTime()) / 86_400_000
      if (daysSinceD1 >= D14_MIN_GAP_DAYS) step = 'd14'
    }
    // After both steps sent, or D1 sent but D14 window not reached: skip.

    if (!step) { skipped++; continue }

    // Per-step kill switch — check flow_settings before touching the coach
    if (step === 'd1' && !flowEnabled.coach_gone_quiet_d1) { skipped++; continue }
    if (step === 'd14' && !flowEnabled.coach_gone_quiet_d14) { skipped++; continue }

    // Cross-flow collision check — 48h window catches coach-recommendations
    // (Tue 08:00) and coach-activation (Wed 09:00), both within 48h of this
    // cron (Fri 09:00). Skip without logging so the step condition is unchanged
    // on the next run — same self-healing property as every other skip.
    const { canSend } = await canSendTouch(supabase, coach.id, 'email', 48)
    if (!canSend) { skipped++; continue }

    if (dryRun) {
      preview.push({ email: coach.email, step, id: coach.id, daysSinceLastPost })
      continue
    }

    try {
      // Fresh recency check — confirms the coach still hasn't posted since we
      // ran the bulk query. Catches a coach who posts mid-run.
      const { data: freshRecent } = await supabase
        .from('opportunities')
        .select('id')
        .eq('coach_id', coach.id)
        .gte('created_at', quietCutoff)
        .limit(1)
        .maybeSingle()
      if (freshRecent) { skipped++; continue }

      if (step === 'd1') {
        const newPlayerCount = playerList.filter(p => p.created_at > lastPostedAt).length

        await sendCoachGoneQuietD1Email({
          to: coach.email!,
          coachName: coach.full_name,
          coachId: coach.id,
          newPlayerCount,
          daysSinceLastPost,
        })
        await logTouch(supabase, coach.id, 'email', 'coach_gone_quiet_d1')
        sentD1++
      } else {
        await sendCoachGoneQuietD14Email({
          to: coach.email!,
          coachName: coach.full_name,
          coachId: coach.id,
          coachesPostedThisWeek,
        })
        await logTouch(supabase, coach.id, 'email', 'coach_gone_quiet_d14')
        sentD14++
      }
    } catch (err) {
      reportError('/api/cron/coach-gone-quiet', err, `send failed for coach ${coach.id} step ${step}`)
      failed++
    }
  }

  return NextResponse.json({
    candidates: eligible.length,
    sentD1,
    sentD14,
    skipped,
    failed,
    coachesPostedThisWeek,
    quietDays: QUIET_DAYS,
    ...(dryRun ? { dryRun: true, preview } : {}),
  })
}
