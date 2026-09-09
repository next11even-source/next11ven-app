import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendCoachActivationD7Email, sendCoachActivationD21Email } from '@/lib/email'
import { logTouch, canSendTouch } from '@/lib/touchpoint'
import { reportError } from '@/lib/alert'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'
import { getFlowSettings } from '@/lib/flowSettings'

export const runtime = 'nodejs'
export const maxDuration = 120

// Coach activation — two-step cadence targeting approved coaches who have never
// posted a role. Runs weekly (Thursday 09:00 UTC).
//
// As of 4 Sep 2026, 134 approved coaches had never posted anything. This is
// the supply constraint: players can't apply if coaches don't post.
//
// Step D7  — sent when coach has been approved >= 7 days and has no D7 log entry.
//            Angle: "here's who's available in your area" (region player count).
//            Personalized to the coach's city — one bulk player query, matched in
//            memory, so no per-coach database round trips.
//
// Step D21 — sent >= 14 days after the D7 send (total ~21 days from join) and
//            only if no D21 log entry exists.
//            Angle: social proof — coaches who posted this week. Different lever;
//            if the D7 stat didn't move them, repeating it won't either.
//
// After both steps: no further dedicated nudging. Fold into general dormancy
// win-back if that's ever built. Two ignored emails from one coach = they
// either have no current need or won't reactivate from email.
//
// Re-check zero-opportunities at send time with a fresh per-coach DB query
// (not the same bulk snapshot) to catch a coach who posted mid-run.

const D7_MIN_DAYS = 7      // days since join before D7 fires
const D21_MIN_GAP_DAYS = 14 // days after D7 send before D21 fires

// If a city-matched count is below this floor, fall back to the platform total.
// A coach in a small town with 0–2 matches shouldn't get "0 players in [city]
// are looking" — that's worse than the generic version, not better.
const MIN_REGION_COUNT = 3

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

  const flowEnabled = await getFlowSettings(supabase, ['coach_activation_d7', 'coach_activation_d21'])
  if (!flowEnabled.coach_activation_d7 && !flowEnabled.coach_activation_d21) {
    return NextResponse.json({ skipped: 'all flows disabled' })
  }

  // ── Coaches who have ever posted at least one opportunity (any state) ──────
  // Checked at query time; re-verified per-coach in the loop before sending.
  const { data: postedRows, error: postedErr } = await supabase
    .from('opportunities')
    .select('coach_id')

  if (postedErr) {
    reportError('/api/cron/coach-activation', postedErr, 'failed to load posted coach IDs')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const hasPosted = new Set((postedRows ?? []).map((r: { coach_id: string }) => r.coach_id))

  // Also exclude coaches who have sent at least one message to a player —
  // they're already active on the platform even without a formal opportunity post.
  // messages.sender_id is the coach's profile ID.
  const { data: messageSenders } = await supabase
    .from('messages')
    .select('sender_id')
    .not('sender_id', 'is', null)

  const hasMessaged = new Set(
    (messageSenders ?? [])
      .map((r: { sender_id: string }) => r.sender_id)
      .filter(Boolean)
  )

  // A coach is "active" if they've posted OR messaged
  const isActive = new Set([...hasPosted, ...hasMessaged])

  // ── Approved coaches (with city for region personalisation) ───────────────
  const { data: coaches, error: coachErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, city, email_marketing_opt_out, created_at')
    .in('role', ['coach'])
    .eq('approved', true)
    .not('email', 'is', null)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)

  if (coachErr) {
    reportError('/api/cron/coach-activation', coachErr, 'failed to load coaches')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  // Initial screen — filters the loop. A fresh per-coach query inside the loop
  // catches anyone who posts or messages between this snapshot and their send.
  const eligible = (coaches ?? []).filter((c: { id: string }) => !isActive.has(c.id))

  if (eligible.length === 0) {
    return NextResponse.json({ candidates: 0, sentD7: 0, sentD21: 0, skipped: 0, failed: 0 })
  }

  const eligibleIds = eligible.map((c: { id: string }) => c.id)

  // ── Touchpoint log — batch fetch both step records for all eligible coaches ─
  const { data: d7Log } = await supabase
    .from('touchpoint_log')
    .select('recipient_id, sent_at')
    .in('recipient_id', eligibleIds)
    .eq('flow', 'coach_activation_d7')
    .eq('channel', 'email')

  const { data: d21Log } = await supabase
    .from('touchpoint_log')
    .select('recipient_id, sent_at')
    .in('recipient_id', eligibleIds)
    .eq('flow', 'coach_activation_d21')
    .eq('channel', 'email')

  const d7SentAt = new Map((d7Log ?? []).map((r: { recipient_id: string; sent_at: string }) => [r.recipient_id, r.sent_at]))
  const d21Sent = new Set((d21Log ?? []).map((r: { recipient_id: string }) => r.recipient_id))

  // ── Platform data (queried once per run, shared across recipients) ─────────

  // Actively-looking players with city — for region personalisation in D7.
  // Matched in memory so there's one DB round trip, not one per coach.
  const { data: activePlayers } = await supabase
    .from('profiles')
    .select('id, city')
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .eq('actively_looking', true)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)

  const activePlayerList = activePlayers ?? []

  // Coaches who posted a role in the last 7 days — D21 social-proof stat.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: recentPosts } = await supabase
    .from('opportunities')
    .select('coach_id')
    .gte('created_at', weekAgo)

  const coachesPostedThisWeek = new Set((recentPosts ?? []).map((r: { coach_id: string }) => r.coach_id)).size

  let sentD7 = 0, sentD21 = 0, skipped = 0, failed = 0
  const preview: Array<{ email: string | null; step: 'd7' | 'd21'; id: string }> = []

  for (const coach of eligible as Array<{
    id: string
    email: string | null
    full_name: string | null
    city: string | null
    email_marketing_opt_out: boolean | null
    created_at: string
  }>) {
    if (only && coach.email !== only) { skipped++; continue }
    if (coach.email_marketing_opt_out) { skipped++; continue }

    const daysSinceJoin = (Date.now() - new Date(coach.created_at).getTime()) / 86_400_000
    const d7At = d7SentAt.get(coach.id)
    const hasSentD7 = Boolean(d7At)
    const hasSentD21 = d21Sent.has(coach.id)

    // ── Determine which step, if any ─────────────────────────────────────────
    let step: 'd7' | 'd21' | null = null

    if (!hasSentD7 && daysSinceJoin >= D7_MIN_DAYS) {
      step = 'd7'
    } else if (hasSentD7 && !hasSentD21 && d7At) {
      const daysSinceD7 = (Date.now() - new Date(d7At).getTime()) / 86_400_000
      if (daysSinceD7 >= D21_MIN_GAP_DAYS) step = 'd21'
    }
    // After both steps sent, or neither condition met: skip.

    if (!step) { skipped++; continue }

    // Per-step kill switch — check flow_settings before touching the coach
    if (step === 'd7' && !flowEnabled.coach_activation_d7) { skipped++; continue }
    if (step === 'd21' && !flowEnabled.coach_activation_d21) { skipped++; continue }

    // Cross-flow collision check — the step gate above only knows "has THIS flow
    // fired yet." It says nothing about whether something else (coach recommendations,
    // an admin broadcast) landed for this coach recently. 48h is the correct window:
    // coach-recommendations fires Tue 08:00, this cron fires Thu 09:00 (49h gap) —
    // safely outside the 48h window so recommendations never blocks activation.
    // Skip without logging so the step-determination condition is unchanged on the
    // next run and the weekly sweep retries automatically — same self-healing
    // property as every other skip.
    const { canSend } = await canSendTouch(supabase, coach.id, 'email', 48)
    if (!canSend) { skipped++; continue }

    if (dryRun) {
      preview.push({ email: coach.email, step, id: coach.id })
      continue
    }

    try {
      // Fresh DB check — confirms the coach still hasn't posted OR messaged by
      // the time we actually send. The isActive Set above is a snapshot from
      // earlier in the run; these queries catch a coach who became active mid-run.
      const { data: freshPost } = await supabase
        .from('opportunities').select('id').eq('coach_id', coach.id).limit(1).maybeSingle()
      const { data: freshMessage } = await supabase
        .from('messages').select('id').eq('sender_id', coach.id).limit(1).maybeSingle()
      if (freshPost || freshMessage) { skipped++; continue }

      if (step === 'd7') {
        // Region player count — match on city (case-insensitive).
        // If city is not set OR the match count is below MIN_REGION_COUNT,
        // fall back to the platform total so a sparse-city coach never gets
        // "0 players in [city] are looking."
        const city = coach.city?.trim() ?? null
        const cityCount = city
          ? activePlayerList.filter((p: { city: string | null }) =>
              p.city?.trim().toLowerCase() === city.toLowerCase()
            ).length
          : 0
        const useRegion = city !== null && cityCount >= MIN_REGION_COUNT
        const regionPlayerCount = useRegion ? cityCount : activePlayerList.length
        const regionLabel = useRegion ? city : null

        await sendCoachActivationD7Email({
          to: coach.email!,
          coachName: coach.full_name,
          coachId: coach.id,
          regionPlayerCount,
          regionLabel,
        })
        await logTouch(supabase, coach.id, 'email', 'coach_activation_d7')
        sentD7++
      } else {
        await sendCoachActivationD21Email({
          to: coach.email!,
          coachName: coach.full_name,
          coachId: coach.id,
          coachesPostedThisWeek,
        })
        await logTouch(supabase, coach.id, 'email', 'coach_activation_d21')
        sentD21++
      }
    } catch (err) {
      reportError('/api/cron/coach-activation', err, `send failed for coach ${coach.id} step ${step}`)
      failed++
    }
  }

  return NextResponse.json({
    candidates: eligible.length,
    sentD7,
    sentD21,
    skipped,
    failed,
    coachesPostedThisWeek,
    ...(dryRun ? { dryRun: true, preview } : {}),
  })
}
