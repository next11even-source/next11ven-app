import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import {
  AWAITING_REPLY_STATUSES,
  CLOSE_AFTER_DAYS,
  MAX_CLOSURES_PER_PLAYER_PER_RUN,
  NOTIFY_RESOLUTION_WITHIN_DAYS,
  waitingDays,
} from '@/lib/applicationResponse'

export const runtime = 'nodejs'
export const maxDuration = 120

// Application closure — the player-side half of the response-rate work.
//
// Runs WEEKLY, Monday 11:00 UTC — an hour after that morning's coach nudge, so
// a coach who acts on the nudge always beats the closure that would have
// followed it. Weekly rather than daily on purpose: closure is bad news, and
// bad news should arrive rarely rather than steadily. A daily run meant a
// player with a deep backlog woke to a closure notification every morning.
//
// SENDS NO EMAIL AND NO SMS. In-app only, one notification per player per run
// however many it closed. Nobody should be texted that they've been ignored.
//
// WHY: an application that is never answered used to sit on the player's
// dashboard as "Pending" forever. Silence and a rejection are the same outcome
// economically — the coach was notified by app, email and SMS and chose not to
// act — but they are NOT the same experience. A no lets a player move on. An
// open-ended nothing teaches them the platform is dead.
//
// So the platform closes it on their behalf and points them at what's open.
// It never states or implies the coach rejected them.

const DAY = 86_400_000

/** Query param as a whole number ≥ 1, falling back on anything else. */
function positiveIntParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

type OpenApp = {
  id: string
  player_id: string
  opportunity_id: string
  created_at: string
  status: string | null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  // Both overrides exist for one job: the first sweep of the historic backlog.
  // The scheduled defaults are tuned for steady state, where a handful of
  // applications cross the window in any given week. Clearing three months of
  // history is a different problem.
  //
  // Parsed defensively — these get typed by hand into a URL, and a NaN would
  // otherwise sail through into an Invalid Date cutoff or a cap that silently
  // closes nothing while reporting success.
  const minDays = positiveIntParam(url, 'minDays', CLOSE_AFTER_DAYS)

  // Raise this for the one-off backlog run so a player with a deep history gets
  // their closures in a single notification instead of the same bad news spread
  // over consecutive Mondays. Leave it alone for scheduled runs.
  const maxPerPlayer = positiveIntParam(url, 'maxPerPlayer', MAX_CLOSURES_PER_PLAYER_PER_RUN)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cutoff = new Date(Date.now() - minDays * DAY).toISOString()

  const { data: apps, error: appErr } = await supabase
    .from('applications')
    .select('id, player_id, opportunity_id, created_at, status')
    .is('closed_at', null)
    .in('status', AWAITING_REPLY_STATUSES)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })

  if (appErr) {
    reportError('/api/cron/application-close', appErr, 'failed to load applications')
    return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
  }

  if (!apps || apps.length === 0) {
    return NextResponse.json({ scanned: 0, closed: 0, notified: 0 })
  }

  // Which of these roles are still open? A role the coach took down gets a
  // different, kinder reason — nobody ignored the player, the job went away.
  const oppIds = [...new Set(apps.map(a => a.opportunity_id))]
  const { data: opps, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, title, club, is_active')
    .in('id', oppIds)

  if (oppErr) {
    reportError('/api/cron/application-close', oppErr, 'failed to load opportunities')
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }

  const oppById = new Map((opps ?? []).map(o => [o.id, o]))

  // Oldest first, capped per player. The cap is the whole reason this is a
  // drip and not a bulk update: closing a player's entire backlog in one run
  // lands as a wall of rejection however carefully the copy is written.
  const perPlayer = new Map<string, number>()
  const toClose: Array<{ app: OpenApp; reason: 'no_response' | 'role_closed' }> = []

  for (const a of apps as OpenApp[]) {
    const used = perPlayer.get(a.player_id) ?? 0
    if (used >= maxPerPlayer) continue
    const opp = oppById.get(a.opportunity_id)
    if (!opp) continue
    perPlayer.set(a.player_id, used + 1)
    toClose.push({ app: a, reason: opp.is_active ? 'no_response' : 'role_closed' })
  }

  if (dryRun) {
    const recent = toClose.filter(t => waitingDays(t.app.created_at) <= NOTIFY_RESOLUTION_WITHIN_DAYS)
    return NextResponse.json({
      dryRun: true,
      // Echoed back so a hand-typed override that failed to parse is obvious
      // in the output rather than silently falling back to the default.
      minDays,
      maxPerPlayer,
      notifyWithinDays: NOTIFY_RESOLUTION_WITHIN_DAYS,
      scanned: apps.length,
      wouldClose: toClose.length,
      players: perPlayer.size,
      // Only recent closures are announced; the rest resolve quietly.
      wouldNotify: new Set(recent.map(t => t.app.player_id)).size,
      wouldCloseSilently: toClose.length - recent.length,
      preview: toClose.slice(0, 10).map(t => ({
        role: oppById.get(t.app.opportunity_id)?.title ?? null,
        waitedDays: waitingDays(t.app.created_at),
        reason: t.reason,
        announced: waitingDays(t.app.created_at) <= NOTIFY_RESOLUTION_WITHIN_DAYS,
      })),
    })
  }

  const now = new Date().toISOString()
  let closed = 0
  let failed = 0

  for (const { app, reason } of toClose) {
    const { error } = await supabase
      .from('applications')
      .update({ closed_at: now, close_reason: reason })
      .eq('id', app.id)
      .is('closed_at', null)   // don't overwrite a concurrent close

    if (error) {
      reportError('/api/cron/application-close', error, `close failed for application ${app.id}`)
      failed++
      continue
    }
    closed++
  }

  // One notification per player per run, never one per application. A player
  // whose two oldest applications close on the same morning should get a single
  // "here's where you stand" — not two separate pieces of bad news.
  //
  // And only RECENT applications are announced at all. Closing something a
  // player sent five months ago is right — it stops the card lying and stops it
  // counting against the coach — but notifying them about it is an excavation,
  // not information. Those close silently; the card tells the story if they
  // ever look. See NOTIFY_RESOLUTION_WITHIN_DAYS.
  let notified = 0
  const byPlayer = new Map<string, number>()
  let silent = 0
  for (const { app } of toClose) {
    if (waitingDays(app.created_at) > NOTIFY_RESOLUTION_WITHIN_DAYS) { silent++; continue }
    byPlayer.set(app.player_id, (byPlayer.get(app.player_id) ?? 0) + 1)
  }

  const rows = [...byPlayer.entries()].map(([playerId, n]) => ({
    recipient_id: playerId,
    actor_id: null,
    type: 'application_closed',
    entity_type: 'opportunity',
    entity_id: null,
    message: n === 1
      ? "One of your applications closed without a reply. We've cleared it so you're not left waiting — there are roles open now."
      : `${n} of your applications closed without a reply. We've cleared them so you're not left waiting — there are roles open now.`,
  }))

  if (rows.length > 0) {
    const { error: notifErr } = await supabase.from('notifications').insert(rows)
    if (notifErr) {
      // Non-fatal: the closure itself is the point, the notification is the
      // courtesy. Never fail the run over it.
      reportError('/api/cron/application-close', notifErr, 'failed to insert closure notifications')
    } else {
      notified = rows.length
    }
  }

  return NextResponse.json({
    minDays, maxPerPlayer, scanned: apps.length, closed, failed, notified,
    closedSilently: silent,
  })
}
