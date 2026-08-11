import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendApplicationNudgeEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'
import { AWAITING_REPLY_STATUSES, waitingDays, getWaitingTier } from '@/lib/applicationResponse'

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

const DAY = 86_400_000

// Don't chase someone the morning after they applied — give them a working
// window to answer on their own before we intervene.
const MIN_AGE_DAYS = 3
const NUDGE_INTERVAL_DAYS = 5

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
    .select('id, coach_id')
    .eq('is_active', true)

  if (oppErr) {
    reportError('/api/cron/application-nudge', oppErr, 'failed to load opportunities')
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }

  const oppOwner = new Map((activeOpps ?? []).map(o => [o.id, o.coach_id]))
  if (oppOwner.size === 0) return NextResponse.json({ candidates: 0, nudgedSms: 0, nudgedEmail: 0 })

  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, opportunity_id, created_at, status')
    .in('opportunity_id', [...oppOwner.keys()])
    .in('status', AWAITING_REPLY_STATUSES)
    // Applications the platform has already closed on the player's behalf are
    // settled. Chasing a coach about them would be nagging over something the
    // player has stopped waiting for.
    .is('closed_at', null)

  if (appErr) {
    reportError('/api/cron/application-nudge', appErr, 'failed to load applications')
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
  }

  // Group the backlog per coach
  type Backlog = { total: number; overdue: number; oldestDays: number }
  const backlog = new Map<string, Backlog>()
  for (const a of apps ?? []) {
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

    if (dryRun) {
      preview.push({ email: c.email, total: b.total, overdue: b.overdue, oldestDays: b.oldestDays })
      continue
    }

    try {
      // ── SMS first (best-effort, respects opt-in + the global 1/day cap) ──
      const lastSms = c.last_sms_at ? new Date(c.last_sms_at) : null
      const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > DAY
      let sentSms = false

      if (
        allowSms &&
        smsAllowed &&
        process.env.TWILIO_ENABLED !== 'false' &&
        c.phone &&
        c.sms_opt_in !== false &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ) {
        const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
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
              Body: `NEXT11VEN: ${b.total} player${b.total === 1 ? '' : 's'} ${b.total === 1 ? 'is' : 'are'} waiting on your answer. A no is still an answer — one tap: ${appUrl}/dashboard/opportunities?tab=mine`,
            }),
          }
        )
        if (res.ok) {
          sentSms = true
          nudgedSms++
          await supabase.from('profiles').update({ last_sms_at: new Date().toISOString() }).eq('id', c.id)
        }
      }

      // ── Email (when SMS didn't go) ──
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
    ...(dryRun ? { dryRun: true, preview } : {}),
  })
}
