import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  sendDripDay3Email,
  sendDripDay7Email,
  sendPaymentFailedFollowUpEmail,
  sendSubscriptionCancelledWinBackEmail,
  sendPlayerOnboardingD0Email,
  sendPlayerOnboardingD1Email,
  sendPlayerOnboardingD3Email,
  sendPlayerOnboardingD7Email,
  sendCoachOnboardingD0Email,
  sendCoachOnboardingD2Email,
  sendCoachOnboardingD5Email,
  sendPlayerProWelcomeEmail,
  sendCoachProWelcomeEmail,
} from '@/lib/email'
import { COMPLETION_CHECKS } from '@/lib/profileCompletion'
import { logTouch } from '@/lib/touchpoint'
import { reportError } from '@/lib/alert'
import { getFlowSettings } from '@/lib/flowSettings'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'

export const runtime = 'nodejs'
export const maxDuration = 60

type ProfileEmbed = {
  email: string | null
  full_name: string | null
  first_name: string | null
  role: string | null
  phone: string | null
  sms_opt_in: boolean | null
  premium: boolean
  last_sms_at: string | null
  email_marketing_opt_out: boolean | null
  position: string | null
  city: string | null
  avatar_url: string | null
  highlight_urls: string[] | null
  bio: string | null
  club: string | null
  status: string | null
  date_of_birth: string | null
  foot: string | null
  height: number | null
  playing_level: string | null
  goals: number | null
  assists: number | null
  appearances: number | null
}

type MessageEmbed = {
  read_at: string | null
}

type DripJob = {
  id: string
  recipient_id: string
  message_id: string | null
  sequence_step: number
  send_at: string
  profiles: ProfileEmbed | ProfileEmbed[] | null
  messages: MessageEmbed | MessageEmbed[] | null
}

function resolveProfile(raw: ProfileEmbed | ProfileEmbed[] | null): ProfileEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

// ── Onboarding step → flow ID mapping ────────────────────────────────────────
const ONBOARDING_STEP_FLOW: Record<number, string> = {
  10: 'player_onboarding_d0',
  11: 'player_onboarding_d1',
  12: 'player_onboarding_d3',
  13: 'player_onboarding_d7',
  14: 'coach_onboarding_d0',
  15: 'coach_onboarding_d2',
  16: 'coach_onboarding_d5',
  20: 'player_pro_welcome',
  21: 'coach_pro_welcome',
}

// ── Per-step onboarding send ──────────────────────────────────────────────────
async function sendOnboardingStep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  job: DripJob,
  profile: ProfileEmbed,
  platformStats: { approvedCoachCount: number; activePlayerCount: number; allTimeOpportunityCount: number }
): Promise<void> {
  const step = job.sequence_step
  const to = profile.email!
  const firstNameParam = profile.first_name
  const coachName = profile.full_name

  switch (step) {
    case 10: {
      await sendPlayerOnboardingD0Email({ to, firstName: firstNameParam })
      await logTouch(supabase, job.recipient_id, 'email', 'player_onboarding_d0')
      break
    }
    case 11: {
      // Fetch tracker data (career history + logged matches) in parallel —
      // both inform completion checks that aren't visible on the flat profile row.
      const [careerRes, matchRes] = await Promise.all([
        supabase.from('career_stats').select('id', { count: 'exact', head: true }).eq('player_id', job.recipient_id),
        supabase.from('performance_matches').select('id', { count: 'exact', head: true }).eq('player_id', job.recipient_id),
      ])
      const completionProfile = {
        avatar_url: profile.avatar_url,
        position: profile.position,
        club: profile.club,
        city: profile.city,
        status: profile.status,
        phone: profile.phone,
        date_of_birth: profile.date_of_birth,
        foot: profile.foot,
        height: profile.height != null ? String(profile.height) : null,
        playing_level: profile.playing_level,
        highlight_urls: profile.highlight_urls,
        goals: profile.goals ?? undefined,
        assists: profile.assists ?? undefined,
        appearances: profile.appearances ?? undefined,
        hasCareerHistory: (careerRes.count ?? 0) > 0,
        hasPerformanceLog: (matchRes.count ?? 0) > 0,
      }
      // Top 5 missing fields, ranked by importance (order defined in profileCompletion.ts)
      const missingFields = COMPLETION_CHECKS
        .filter(c => !c.done(completionProfile))
        .slice(0, 5)
        .map(c => ({ label: c.label, why: c.why }))
      await sendPlayerOnboardingD1Email({ to, firstName: firstNameParam, playerId: job.recipient_id, missingFields })
      await logTouch(supabase, job.recipient_id, 'email', 'player_onboarding_d1')
      break
    }
    case 12: {
      await sendPlayerOnboardingD3Email({
        to,
        firstName: firstNameParam,
        playerId: job.recipient_id,
        approvedCoachCount: platformStats.approvedCoachCount,
      })
      await logTouch(supabase, job.recipient_id, 'email', 'player_onboarding_d3')
      break
    }
    case 13: {
      // Open roles for player's position + region. Floor: < 3 → fallback copy.
      const position = profile.position
      const city = profile.city
      const roleQuery = supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      if (position) roleQuery.eq('position', position)
      if (city) roleQuery.ilike('location', `%${city}%`)
      const { count: roleCount } = await roleQuery
      const openRoleCount = roleCount ?? 0
      const statAvailable = openRoleCount >= 3
      await sendPlayerOnboardingD7Email({
        to, firstName: firstNameParam, playerId: job.recipient_id,
        openRoleCount, statAvailable, position,
      })
      await logTouch(supabase, job.recipient_id, 'email', 'player_onboarding_d7')
      break
    }
    case 14: {
      await sendCoachOnboardingD0Email({
        to, coachName,
        activePlayerCount: platformStats.activePlayerCount,
      })
      await logTouch(supabase, job.recipient_id, 'email', 'coach_onboarding_d0')
      break
    }
    case 15: {
      // Regional player count for coach's city. Floor: < 3 → platform framing.
      const city = profile.city?.trim() ?? null
      let regionalPlayerCount = 0
      if (city) {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .in('role', ['player', 'admin'])
          .eq('approved', true)
          .not('id', 'in', HIDDEN_PROFILE_FILTER)
          .ilike('city', `%${city}%`)
        regionalPlayerCount = count ?? 0
      }
      const statAvailable = city !== null && regionalPlayerCount >= 3
      const regionLabel = statAvailable ? city : null
      await sendCoachOnboardingD2Email({
        to, coachName, coachId: job.recipient_id,
        regionalPlayerCount: statAvailable ? regionalPlayerCount : 0,
        statAvailable,
        regionLabel,
      })
      await logTouch(supabase, job.recipient_id, 'email', 'coach_onboarding_d2')
      break
    }
    case 16: {
      // Recruiting coach count: active opportunity OR message sent in last 30 days.
      const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const [{ data: activeOppCoaches }, { data: recentMsgCoaches }] = await Promise.all([
        supabase.from('opportunities').select('coach_id').eq('is_active', true),
        supabase.from('messages').select('sender_id').gte('created_at', cutoff30d).not('sender_id', 'is', null),
      ])
      const recruitingSet = new Set([
        ...(activeOppCoaches ?? []).map((r: { coach_id: string }) => r.coach_id),
        ...(recentMsgCoaches ?? []).map((r: { sender_id: string }) => r.sender_id).filter(Boolean),
      ])
      const recruitingCoachCount = recruitingSet.size
      const statAvailable = recruitingCoachCount >= 5
      await sendCoachOnboardingD5Email({
        to, coachName, coachId: job.recipient_id,
        recruitingCoachCount,
        statAvailable,
        fallbackOpportunityCount: platformStats.allTimeOpportunityCount,
      })
      await logTouch(supabase, job.recipient_id, 'email', 'coach_onboarding_d5')
      break
    }
    case 20: {
      await sendPlayerProWelcomeEmail({ to, firstName: firstNameParam })
      await logTouch(supabase, job.recipient_id, 'email', 'player_pro_welcome')
      break
    }
    case 21: {
      await sendCoachProWelcomeEmail({ to, coachName })
      await logTouch(supabase, job.recipient_id, 'email', 'coach_pro_welcome')
      break
    }
    default:
      throw new Error(`unhandled onboarding step: ${step}`)
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const flowEnabled = await getFlowSettings(supabase, [
    'drip_day3', 'drip_day7', 'winback', 'payment_failed_followup',
    'player_onboarding_d0', 'player_onboarding_d1', 'player_onboarding_d3', 'player_onboarding_d7',
    'coach_onboarding_d0', 'coach_onboarding_d2', 'coach_onboarding_d5',
    'player_pro_welcome', 'coach_pro_welcome',
  ])

  const { data: jobs, error } = await supabase
    .from('drip_jobs')
    .select('id, recipient_id, message_id, sequence_step, send_at, profiles(email, full_name, first_name, role, phone, sms_opt_in, premium, last_sms_at, email_marketing_opt_out, position, city, avatar_url, highlight_urls, bio, club, status, date_of_birth, foot, height, playing_level, goals, assists, appearances), messages(read_at)')
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .limit(100)

  if (error) {
    console.error('[Drip cron] query error:', error)
    reportError('/api/cron/drip-reminders', error, 'failed to query drip_jobs')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Check if any onboarding steps are in this batch (steps 10–21).
  // If so, fetch platform-wide stats once here rather than per-job.
  const hasOnboardingJobs = (jobs ?? []).some(
    (j: { sequence_step: number }) => j.sequence_step >= 10 && j.sequence_step <= 21
  )

  let platformStats: {
    approvedCoachCount: number
    activePlayerCount: number
    allTimeOpportunityCount: number
  } | null = null

  if (hasOnboardingJobs) {
    const [coachCountResult, playerCountResult, oppCountResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'coach')
        .eq('approved', true)
        .not('id', 'in', HIDDEN_PROFILE_FILTER),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('role', ['player', 'admin'])
        .eq('approved', true)
        .not('id', 'in', HIDDEN_PROFILE_FILTER),
      supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true }),
    ])
    platformStats = {
      approvedCoachCount: coachCountResult.count ?? 0,
      activePlayerCount: playerCountResult.count ?? 0,
      allTimeOpportunityCount: oppCountResult.count ?? 0,
    }
  }

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const job of jobs as unknown as DripJob[]) {
    const profile = resolveProfile(job.profiles)

    if (!profile) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // ── Transactional billing steps — bypass marketing opt-out ─────────────────
    // step 99: payment failed 48h follow-up
    // step 98: subscription cancelled win-back (3 days)
    if (job.sequence_step === 99 || job.sequence_step === 98) {
      // Kill switch — leave job pending so it retries when the flow is re-enabled
      if (job.sequence_step === 99 && !flowEnabled.payment_failed_followup) { skipped++; continue }
      if (job.sequence_step === 98 && !flowEnabled.winback) { skipped++; continue }

      // Skip only if they've re-subscribed since the job was queued
      if (profile.premium === true) {
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        skipped++
        continue
      }

      if (job.sequence_step === 99) {
        try {
          if (profile.email) {
            await sendPaymentFailedFollowUpEmail({ to: profile.email, toName: profile.full_name })
            await logTouch(supabase, job.recipient_id, 'email', 'payment_failed_followup')
          }
          await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
          processed++
        } catch (err) {
          console.error(`[Drip cron] job ${job.id} step 99 failed:`, err)
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 99 failed`)
          failed++
        }
      } else {
        // step 98 — win-back
        try {
          const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
          let opportunityCount: number | undefined
          // Filter by the player's position if available — "3 new striker roles" beats "14 new roles"
          const oppQuery = supabase
            .from('opportunities')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .gte('created_at', since)
          if (profile.position) oppQuery.eq('position', profile.position)
          const { count, error: oppError } = await oppQuery
          if (!oppError && count !== null) {
            opportunityCount = count
          }

          if (profile.email) {
            await sendSubscriptionCancelledWinBackEmail({
              to: profile.email,
              toName: profile.full_name,
              userId: job.recipient_id,
              opportunityCount,
              playerPosition: profile.position,
            })
            await logTouch(supabase, job.recipient_id, 'email', 'winback')
          }
          await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
          processed++
        } catch (err) {
          console.error(`[Drip cron] job ${job.id} step 98 failed:`, err)
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 98 failed`)
          failed++
        }
      }
      continue
    }

    // ── Onboarding sequence steps (10–21) ─────────────────────────────────────
    if (job.sequence_step >= 10 && job.sequence_step <= 21) {
      // Platform stats must be loaded (they always are if we got here, since
      // hasOnboardingJobs was true above).
      if (!platformStats) {
        // Safety: shouldn't happen, but if stats are missing, skip and let next run retry
        console.error('[Drip cron] platformStats missing for onboarding job', job.id)
        skipped++
        continue
      }

      const flowId = ONBOARDING_STEP_FLOW[job.sequence_step]
      if (!flowId) {
        // Unrecognised onboarding step — mark sent to avoid infinite retry
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        skipped++
        continue
      }

      if (!flowEnabled[flowId]) {
        // Flow disabled — skip without marking sent (retry when re-enabled)
        skipped++
        continue
      }

      // Marketing opt-out: D0 and Pro welcomes are exempt; D1/D3/D7/D2/D5 are gated
      const isMarketingStep = [11, 12, 13, 15, 16].includes(job.sequence_step)
      if (isMarketingStep && profile.email_marketing_opt_out === true) {
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        skipped++
        continue
      }

      if (!profile.email) {
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        skipped++
        continue
      }

      try {
        await sendOnboardingStep(supabase, job, profile, platformStats)
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        processed++
      } catch (err) {
        console.error(`[Drip cron] job ${job.id} step ${job.sequence_step} failed:`, err)
        reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step ${job.sequence_step} failed`)
        failed++
      }
      continue
    }

    // ── Marketing drip steps 2 and 3 ────────────────────────────────────────────

    // Stop sequence if player has already upgraded
    if (profile.premium === true) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // Stop sequence if player has opted out of marketing emails
    if (profile.email_marketing_opt_out === true) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // Stop sequence if the triggering message has already been read
    // (player was previously premium, read it, then lapsed — don't prompt them to upgrade for a message they've seen)
    const msgEmbed = job.messages
    const msg = Array.isArray(msgEmbed) ? (msgEmbed[0] ?? null) : msgEmbed
    if (msg?.read_at) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // Kill switch — leave job pending so it retries when the flow is re-enabled
    if (job.sequence_step === 2 && !flowEnabled.drip_day3) { skipped++; continue }
    if (job.sequence_step === 3 && !flowEnabled.drip_day7) { skipped++; continue }

    if (job.sequence_step === 2) {
      // Day 3 — email only
      try {
        if (profile.email) {
          await sendDripDay3Email({ to: profile.email, toName: profile.full_name, playerId: job.recipient_id })
          await logTouch(supabase, job.recipient_id, 'email', 'drip_day3')
        }
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        processed++
      } catch (err) {
        console.error(`[Drip cron] job ${job.id} step 2 failed:`, err)
        reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 2 failed`)
        failed++
      }
    } else if (job.sequence_step === 3) {
      // Day 7 — SMS (best-effort) then email (required to mark sent)
      const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
      const lastSms = profile.last_sms_at ? new Date(profile.last_sms_at) : null
      const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > 86_400_000

      if (
        smsAllowed &&
        process.env.TWILIO_ENABLED !== 'false' &&
        profile.phone &&
        profile.sms_opt_in !== false &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ) {
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                From: process.env.TWILIO_FROM_NUMBER,
                To: profile.phone,
                Body: `NEXT11VEN: A coach messaged you and won't wait forever. The longer this sits, the more likely they've moved on. Upgrade now: ${appUrl}/dashboard/player/premium`,
              }),
            }
          )
          await supabase
            .from('profiles')
            .update({ last_sms_at: new Date().toISOString() })
            .eq('id', job.recipient_id)
          await logTouch(supabase, job.recipient_id, 'sms', 'drip_day7')
        } catch (err) {
          // SMS failure is non-blocking — log but still send the email and mark sent
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 3 SMS failed`)
        }
      }

      try {
        if (profile.email) {
          await sendDripDay7Email({ to: profile.email, toName: profile.full_name, playerId: job.recipient_id })
          await logTouch(supabase, job.recipient_id, 'email', 'drip_day7')
        }
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        processed++
      } catch (err) {
        console.error(`[Drip cron] job ${job.id} step 3 email failed:`, err)
        reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 3 email failed`)
        failed++
      }
    } else {
      // Unknown step — mark sent to avoid infinite retry
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
    }
  }

  return NextResponse.json({ processed, skipped, failed })
}
