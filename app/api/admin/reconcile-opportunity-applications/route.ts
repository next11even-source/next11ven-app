/**
 * GET /api/admin/reconcile-opportunity-applications
 *
 * Admin-only. Same philosophy as /api/admin/stripe-reconcile, different
 * domain: finds applications stranded in "waiting" on a role that's already
 * closed, and resolves them via the same cascade opportunity-close and the
 * manual "Close Role" toggle use (lib/opportunityClosure.ts).
 *
 * Should be a no-op in steady state — both closure paths cascade the moment
 * they run. This exists for the gap between "opportunity closed" and "cascade
 * exists": any opportunity closed BEFORE lib/opportunityClosure.ts shipped
 * (13 Aug 2026) has applications nobody ever resolved. application-close's
 * weekly sweep is the eventual backstop (it catches 'role_closed' once the
 * APPLICATION ages past CLOSE_AFTER_DAYS, regardless of why), but there's no
 * reason to make a player wait for that when we can resolve it now. Also a
 * general safety net if this class of gap is ever reintroduced by a future bug.
 *
 * ?dryRun=1 — report what it would do, write nothing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server'
import { isAwaitingReply } from '@/lib/applicationResponse'
import { closeApplicationsForOpportunity } from '@/lib/opportunityClosure'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const { data: closedOppsRaw, error: oppErr } = await supabase
    .from('opportunities')
    .select('id, title')
    .eq('is_active', false)

  const closedOpps = closedOppsRaw as Array<{ id: string; title: string }> | null

  if (oppErr) {
    reportError('/api/admin/reconcile-opportunity-applications', oppErr, 'failed to load closed opportunities')
    return NextResponse.json({ error: 'Failed to load opportunities' }, { status: 500 })
  }

  if (!closedOpps || closedOpps.length === 0) {
    return NextResponse.json({ opportunitiesScanned: 0, applicationsClosed: 0, playersNotified: 0 })
  }

  if (dryRun) {
    const { data: apps } = await supabase
      .from('applications')
      .select('opportunity_id, status, closed_at')
      .in('opportunity_id', closedOpps.map(o => o.id))
      .is('closed_at', null)

    const strandedByOpp = new Map<string, number>()
    for (const a of apps ?? []) {
      if (!isAwaitingReply(a.status, a.closed_at)) continue
      strandedByOpp.set(a.opportunity_id, (strandedByOpp.get(a.opportunity_id) ?? 0) + 1)
    }

    const preview = closedOpps
      .filter(o => strandedByOpp.has(o.id))
      .map(o => ({ title: o.title, stranded: strandedByOpp.get(o.id) }))

    return NextResponse.json({
      dryRun: true,
      opportunitiesScanned: closedOpps.length,
      opportunitiesAffected: preview.length,
      wouldClose: [...strandedByOpp.values()].reduce((a, b) => a + b, 0),
      preview: preview.slice(0, 30),
    })
  }

  // Note: notifications are batched per OPPORTUNITY (via the shared cascade),
  // not per player across the whole run the way application-close's own sweep
  // is. A player with stranded applications on two different closed roles in
  // this one pass gets two notification rows, not one combined row. Acceptable
  // for a bounded, one-off reconciliation pass — not worth the extra batching
  // complexity for what's a rare overlap in a run this small.
  let applicationsClosed = 0
  let playersNotified = 0
  let opportunitiesAffected = 0

  for (const opp of closedOpps) {
    try {
      const result = await closeApplicationsForOpportunity(supabase, opp.id)
      if (result.closed > 0) opportunitiesAffected++
      applicationsClosed += result.closed
      playersNotified += result.notified
    } catch (err) {
      reportError('/api/admin/reconcile-opportunity-applications', err, `reconcile failed for opportunity ${opp.id}`)
    }
  }

  return NextResponse.json({
    opportunitiesScanned: closedOpps.length,
    opportunitiesAffected,
    applicationsClosed,
    playersNotified,
  })
}
