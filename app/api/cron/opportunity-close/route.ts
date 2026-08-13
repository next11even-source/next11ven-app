import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import { sendOpportunityAutoClosedEmail } from '@/lib/email'
import { isAwaitingReply } from '@/lib/applicationResponse'
import {
  ageDays,
  getOpportunityLifecycleStatus,
  OPP_NEGLECT_DAYS,
} from '@/lib/opportunityLifecycle'

export const runtime = 'nodejs'
export const maxDuration = 120

// Stale opportunity auto-removal — the opportunity-side half of the
// response-rate work. Runs WEEKLY, Monday 11:30 UTC — half an hour after
// application-close, so a role that just had its stragglers auto-closed for
// no_response is evaluated for closure itself in the same pass.
//
// HIDES (is_active = false), NEVER DELETES. Two rules — see
// lib/opportunityLifecycle.ts for the shared thresholds:
//   'stale'     — 28 days old, regardless of activity.
//   'neglected' — 14 days old, has an application still awaiting reply, and
//                 the coach has never accepted or rejected anyone on it. A
//                 role with zero applications is exempt from this fast track.
//
// Notifies the coach in-app + EMAIL (no SMS — this cron doesn't add SMS
// volume; the pre-close warning rides the existing application-nudge send
// instead, see that route). One email per coach per run listing every role
// closed, not one per role.

type Opp = {
  id: string
  coach_id: string
  title: string
  created_at: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Anything younger than the neglect window can't be stale or neglected yet
  // — filter it out of the scan rather than fetching and discarding.
  const cutoff = new Date(Date.now() - OPP_NEGLECT_DAYS * 86_400_000).toISOString()

  const { data: opps, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, coach_id, title, created_at')
    .eq('is_active', true)
    .lt('created_at', cutoff)

  if (oppErr) {
    reportError('/api/cron/opportunity-close', oppErr, 'failed to load opportunities')
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }

  if (!opps || opps.length === 0) {
    return NextResponse.json({ scanned: 0, closed: 0, notified: 0 })
  }

  const oppIds = opps.map(o => o.id)
  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('opportunity_id, status, closed_at')
    .in('opportunity_id', oppIds)

  if (appErr) {
    reportError('/api/cron/opportunity-close', appErr, 'failed to load applications')
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
  }

  const hasAwaiting = new Set<string>()
  const hasEverActioned = new Set<string>()
  for (const a of apps ?? []) {
    if (isAwaitingReply(a.status, a.closed_at)) hasAwaiting.add(a.opportunity_id)
    if (a.status === 'accepted' || a.status === 'rejected') hasEverActioned.add(a.opportunity_id)
  }

  const toClose: Array<{ opp: Opp; reason: 'stale' | 'neglected' }> = []
  for (const o of opps as Opp[]) {
    const status = getOpportunityLifecycleStatus(
      ageDays(o.created_at),
      hasAwaiting.has(o.id),
      hasEverActioned.has(o.id)
    )
    if (status === 'stale' || status === 'neglected') toClose.push({ opp: o, reason: status })
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      scanned: opps.length,
      wouldClose: toClose.length,
      coaches: new Set(toClose.map(t => t.opp.coach_id)).size,
      preview: toClose.slice(0, 20).map(t => ({
        title: t.opp.title,
        ageDays: ageDays(t.opp.created_at),
        reason: t.reason,
      })),
    })
  }

  const now = new Date().toISOString()
  let closed = 0
  let failed = 0
  const closedByCoach = new Map<string, Array<{ title: string; reason: 'stale' | 'neglected' }>>()

  for (const { opp, reason } of toClose) {
    const { error } = await supabase
      .from('opportunities')
      .update({ is_active: false, auto_closed_at: now, auto_close_reason: reason })
      .eq('id', opp.id)
      .eq('is_active', true) // don't overwrite a concurrent close

    if (error) {
      reportError('/api/cron/opportunity-close', error, `close failed for opportunity ${opp.id}`)
      failed++
      continue
    }
    closed++
    const list = closedByCoach.get(opp.coach_id) ?? []
    list.push({ title: opp.title, reason })
    closedByCoach.set(opp.coach_id, list)
  }

  let notified = 0
  if (closedByCoach.size > 0) {
    const { data: coaches } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', [...closedByCoach.keys()])

    const rows = [...closedByCoach.entries()].map(([coachId, roles]) => ({
      recipient_id: coachId,
      actor_id: null,
      type: 'opportunity_auto_closed',
      entity_type: 'opportunity',
      entity_id: null,
      message: roles.length === 1
        ? `"${roles[0].title}" was closed automatically — ${roles[0].reason === 'neglected' ? 'applicants were still waiting on an answer' : 'it had been open a while with no update'}. Reopen it any time.`
        : `${roles.length} of your roles were closed automatically — applicants were waiting or the role had gone quiet. Reopen any of them any time.`,
    }))

    const { error: notifErr } = await supabase.from('notifications').insert(rows)
    if (notifErr) {
      reportError('/api/cron/opportunity-close', notifErr, 'failed to insert auto-close notifications')
    } else {
      notified = rows.length
    }

    for (const c of coaches ?? []) {
      const roles = closedByCoach.get(c.id)
      if (!roles || !c.email) continue
      try {
        await sendOpportunityAutoClosedEmail({ to: c.email, coachName: c.full_name, roles })
      } catch (err) {
        reportError('/api/cron/opportunity-close', err, `email failed for coach ${c.id}`)
      }
    }
  }

  return NextResponse.json({ scanned: opps.length, closed, failed, notified })
}
