import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendApplicationNudgeEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'
import { isAwaitingReply, waitingDays, getWaitingTier } from '@/lib/applicationResponse'
import { ageDays, getOpportunityLifecycleStatus, OPP_NEGLECT_DAYS } from '@/lib/opportunityLifecycle'

export const runtime = 'nodejs'
export const maxDuration = 120

// Coach application nudge — the only surface with REACH into the response-rate
// problem. Runs daily 10:00 UTC.
//
// Everything else we built (dashboard banner, role-card counts, bell badge) only
// works on a coach who opens the app. As of 9 Aug 2026, 66% of all applications
// had never been answered and the backlog was concentrated in 13 coaches, the
// worst sitting on 35 — exactly the coaches least likely to be logging in.
// This reaches them where they are.
//
// SMS-first when opted in and inside the 1/day cap, email otherwise.
// One nudge per coach per NUDGE_INTERVAL_DAYS regardless of backlog size.
//
// Also carries the pre-close warning for /api/cron/opportunity-close: when a
// coach has a role nearing the 14-day neglect cutoff (see
// lib/opportunityLifecycle.ts), this send gets one extra line rather than a
// separate message — deliberately, to avoid adding SMS volume for it.

const DAY = 86_400_000

// Don't chase someone the morning after they applied — give them a working
// window to answer on their own before we intervene.
const MIN_AGE_DAYS = 3
const NUDGE_INTERVAL_DAYS = 5

// Hard ceiling on SMS sent by this run, however large the eligible pool gets.
// Email is the default channel here on purpose — SMS is reserved for reach,
// not volume. Once the cap is hit, remaining coaches still get nudged, just
// by email instead of falling through to a text.
const MAX_SMS_PER_RUN = 40

type Coach = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  sms_opt_in: boolean | null
  last_sms_at: string | null
  email_marketing_opt_out: boolean | null
  last_application_nudge_at: string | null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const only = url.searchParams.get('to')   // single-coach test by email
  // Testing affordance: a coach with sms_opt_in gets SMS and never sees the
  // email, so ?channel=email forces the email leg (and vice versa).
  const channel = url.searchParams.get('channel')  // 'email' | 'sms' | null (both)
  const allowSms = channel !== 'email'
  const allowEmail = channel !== 'sms'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Only chase applications on roles that are still open. Nagging a coach about
  // a role they filled in May is how a nudge becomes noise.
  const { data: activeOpps, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, coach_id, created_at')
    .eq('is_active', true)

  if (oppErr) {
    reportError('/api/cron/application-nudge', oppErr, 'failed to load opportunities')
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }

  const oppOwner = new Map((activeOpps ?? []).map(o => [o.id, o.coach_id]))
  if (oppOwner.size === 0) return NextResponse.json({ candidates: 0, nudgedSms: 0, nudgedEmail: 0 })

  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, opportunity_id, created_at, status, closed_at')
    .in('opportunity_id', [...oppOwner.keys()])

  if (appErr) {
    reportError('/api/cron/application-nudge', appErr, 'failed to load applications')
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
  }

  // Group the backlog per coach, and separately track which roles have an
  // awaiting application / a real accept-reject decision ever — the inputs
  // opportunity-close uses to decide if a role is heading for auto-closure.
  type Backlog = { total: number; overdue: number; oldestDays: number }
  const backlog = new Map<string, Backlog>()
  const hasAwaiting = new Set<string>()
  const hasEverActioned = new Set<string>()
  for (const a of apps ?? []) {
    if (isAwaitingReply(a.status, a.closed_at)) hasAwaiting.add(a.opportunity_id)
    if (a.status === 'accepted' || a.status === 'rejected') hasEverActioned.add(a.opportunity_id)

    if (!isAwaitingReply(a.status, a.closed_at)) continue
    const coachId = oppOwner.get(a.opportunity_id)
    if (!coachId) continue
    const days = waitingDays(a.created_at)
    if (days < MIN_AGE_DAYS) continue
    const b = backlog.get(coachId) ?? { total: 0, overdue: 0, oldestDays: 0 }
    b.total++
    if (getWaitingTier(days) === 'overdue') b.overdue++
    if (days > b.oldestDays) b.oldestDays = days
    backlog.set(coachId, b)
  }

  // Roles about to auto-close under the neglect rule, per coach — folded into
  // whatever nudge that coach already gets rather than a new send.
  type AtRisk = { count: number; minDaysLeft: number }
  const atRiskByCoach = new Map<string, AtRisk>()
  for (const o of activeOpps ?? []) {
    const status = getOpportunityLifecycleStatus(ageDays(o.created_at), hasAwaiting.has(o.id), hasEverActioned.has(o.id))
    if (status !== 'at_risk') continue
    const daysLeft = Math.max(0, OPP_NEGLECT_DAYS - ageDays(o.created_at))
    const cur = atRiskByCoach.get(o.coach_id) ?? { count: 0, minDaysLeft: daysLeft }
    cur.count++
    cur.minDaysLeft = Math.min(cur.minDaysLeft, daysLeft)
    atRiskByCoach.set(o.coach_id, cur)
  }

  if (backlog.size === 0) return NextResponse.json({ candidates: 0, nudgedSms: 0, nudgedEmail: 0 })

  const { data: coaches, error: coachErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, sms_opt_in, last_sms_at, email_marketing_opt_out, last_application_nudge_at')
    .in('id', [...backlog.keys()])
    .eq('approved', true)

  if (coachErr) {
    reportError('/api/cron/application-nudge', coachErr, 'failed to load coaches')
    return NextResponse.json({ error: 'Failed to load coaches' }, { status: 500 })
  }

  let nudgedSms = 0, nudgedEmail = 0, skipped = 0, failed = 0
  const preview: Array<{ email: string | null; total: number; overdue: number; oldestDays: number }> = []

  for (const c of (coaches ?? []) as Coach[]) {
    const b = backlog.get(c.id)
    if (!b) continue
    if (only && c.email !== only) { skipped++; continue }

    // Frequency cap — one nudge per coach per interval, however big the backlog.
    const lastNudge = c.last_application_nudge_at ? new Date(c.last_application_nudge_at).getTime() : 0
    if (lastNudge && Date.now() - lastNudge < NUDGE_INTERVAL_DAYS * DAY) { skipped++; continue }

    const atRisk = atRiskByCoach.get(c.id)

    if (dryRun) {
      preview.push({ email: c.email, total: b.total, overdue: b.overdue, oldestDays: b.oldestDays })
      continue
    }

    try {
      // ── SMS first (best-effort, respects opt-in + the global 1/day cap AND
      // the per-run cap — see MAX_SMS_PER_RUN) ──
      const lastSms = c.last_sms_at ? new Date(c.last_sms_at) : null
      const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > DAY
      let sentSms = false

      if (
        allowSms &&
        smsAllowed &&
        nudgedSms < MAX_SMS_PER_RUN &&
        process.env.TWILIO_ENABLED !== 'false' &&
        c.phone &&
        c.sms_opt_in !== false &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ) {
        const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
        const atRiskClause = atRisk
          ? ` ${atRisk.count} role${atRisk.count === 1 ? '' : 's'} auto-close${atRisk.count === 1 ? 's' : ''} in ${atRisk.minDaysLeft}d if unanswered.`
          : ''
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: process.env.TWILIO_FROM_NUMBER,
              To: c.phone,
              Body: `NEXT11VEN: ${b.total} player${b.total === 1 ? '' : 's'} ${b.total === 1 ? 'is' : 'are'} waiting on your answer.${atRiskClause} A no is still an answer — one tap: ${appUrl}/dashboard/opportunities?tab=mine`,
            }),
          }
        )
        if (res.ok) {
          sentSms = true
          nudgedSms++
          await supabase.from('profiles').update({ last_sms_at: new Date().toISOString() }).eq('id', c.id)
        }
      }

      // ── Email (when SMS didn't go — including when the per-run SMS cap was
      // hit, so a coach past the cap still gets nudged, just by email) ──
      // Suppressed by email_marketing_opt_out. Arguable — these are applications
      // to a role the coach posted themselves, so it leans transactional — but a
      // nudge is still a nudge, and the bell + dashboard banner now cover the
      // opted-out case. Flip this if response rate stays flat.
      if (allowEmail && !sentSms && c.email && c.email_marketing_opt_out !== true) {
        await sendApplicationNudgeEmail({
          to: c.email,
          coachName: c.full_name,
          total: b.total,
          overdue: b.overdue,
          oldestDays: b.oldestDays,
          atRiskCount: atRisk?.count,
          atRiskDaysLeft: atRisk?.minDaysLeft,
        })
        nudgedEmail++
      } else if (!sentSms) {
        skipped++
        continue   // nothing sent — don't burn the frequency cap
      }

      await supabase
        .from('profiles')
        .update({ last_application_nudge_at: new Date().toISOString() })
        .eq('id', c.id)
    } catch (err) {
      reportError('/api/cron/application-nudge', err, `nudge failed for coach ${c.id}`)
      failed++
    }
  }

  return NextResponse.json({
    candidates: backlog.size,
    nudgedSms,
    nudgedEmail,
    skipped,
    failed,
    smsCapReached: nudgedSms >= MAX_SMS_PER_RUN,
    ...(dryRun ? { dryRun: true, preview } : {}),
  })
}
