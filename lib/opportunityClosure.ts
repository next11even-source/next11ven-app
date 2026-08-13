/**
 * Cascades an opportunity's closure onto its own open applications — shared by
 * /api/cron/opportunity-close (auto-close) and /api/opportunities/[id] (a
 * coach's manual "Close Role").
 *
 * WHY: without this, an application sits in the `waiting` state ("With the
 * club") for up to CLOSE_AFTER_DAYS (21) after its role is already dead —
 * application-close only picks it up once the APPLICATION itself ages out,
 * which can lag well behind when the ROLE actually closed. We already know
 * the role is gone the moment this runs; there's no reason to make the player
 * wait for the separate age-based sweep to find out.
 *
 * Reuses the existing 'application_closed' notification type and
 * NOTIFY_RESOLUTION_WITHIN_DAYS rule — same in-app-only, no-email-no-SMS,
 * "don't excavate old stuff" doctrine as application-close. This never sets
 * close_reason to anything but 'role_closed': the role went away, nobody
 * decided on this player either way.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isAwaitingReply, waitingDays, NOTIFY_RESOLUTION_WITHIN_DAYS } from './applicationResponse'

export async function closeApplicationsForOpportunity(
  supabase: SupabaseClient,
  opportunityId: string
): Promise<{ closed: number; notified: number }> {
  const { data: apps } = await supabase
    .from('applications')
    .select('id, player_id, created_at, status, closed_at')
    .eq('opportunity_id', opportunityId)
    .is('closed_at', null)

  const candidates = (apps ?? []).filter((a: { status: string | null; closed_at: string | null }) =>
    isAwaitingReply(a.status, a.closed_at)
  )
  if (candidates.length === 0) return { closed: 0, notified: 0 }

  const now = new Date().toISOString()
  // Guard the WRITE itself, not just the read above — that read is a
  // snapshot and can race a concurrent call for the same opportunity (a
  // double-tap on "Close Role", a retried request, the cron and a manual
  // close landing together). .is('closed_at', null) here means only rows
  // STILL open at the moment this UPDATE actually executes get touched;
  // Postgres row-level locking means a second concurrent call sees these
  // rows as already closed and its own filtered update returns nothing for
  // them. The notification list is built from what THIS update affected —
  // never from the earlier read — so a race can close nobody twice and
  // notify nobody twice.
  const { data: justClosed } = await supabase
    .from('applications')
    .update({ closed_at: now, close_reason: 'role_closed' })
    .in('id', candidates.map((a: { id: string }) => a.id))
    .is('closed_at', null)
    .select('player_id, created_at')

  const open = (justClosed ?? []) as Array<{ player_id: string; created_at: string }>
  if (open.length === 0) return { closed: 0, notified: 0 }

  // Only recent applications are announced — see NOTIFY_RESOLUTION_WITHIN_DAYS.
  // One notification per player, never one per application.
  const byPlayer = new Map<string, number>()
  for (const a of open) {
    if (waitingDays(a.created_at) > NOTIFY_RESOLUTION_WITHIN_DAYS) continue
    byPlayer.set(a.player_id, (byPlayer.get(a.player_id) ?? 0) + 1)
  }

  if (byPlayer.size > 0) {
    const rows = [...byPlayer.entries()].map(([playerId, n]) => ({
      recipient_id: playerId,
      actor_id: null,
      type: 'application_closed',
      entity_type: 'opportunity',
      entity_id: null,
      message: n === 1
        ? "One of your applications closed — the role came down before the club got to it. We've cleared it so you're not left waiting."
        : `${n} of your applications closed — the roles came down before the club got to them. We've cleared them so you're not left waiting.`,
    }))
    await supabase.from('notifications').insert(rows)
  }

  return { closed: open.length, notified: byPlayer.size }
}
