import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import {
  MAX_REFUNDS_PER_RUN,
  REFUND_AFTER_DAYS,
  REFUND_ELIGIBLE_FROM,
  refundNotificationMessage,
} from '@/lib/messageCredits'

export const runtime = 'nodejs'
export const maxDuration = 120

// Message credit refund — the player-side answer to a coach who never replies.
//
// Runs DAILY, 12:00 UTC. Unlike application closure this is good news, so it
// arrives promptly rather than being batched into one weekly dose.
//
// WHAT IT DOES: any conversation the PLAYER started, that the coach has not
// replied to after REFUND_AFTER_DAYS, gets its credit returned. The credit
// lands in profiles.purchased_message_credits (never expires, never resets)
// rather than in the monthly quota row — a monthly credit refunded three weeks
// into a period would be worth nothing once the period rolled.
//
// SENDS NO EMAIL AND NO SMS. In-app only, one notification per player per run
// however many credits came back. "A coach ignored you" is not worth a text,
// and the credit itself is the thing that matters; they'll see it when they
// next go to spend one.
//
// NOT RETROACTIVE: REFUND_ELIGIBLE_FROM is a hard floor. This is a promise
// about how the product behaves from now on, not a rebate on every message
// ever sent — nobody was short-changed by getting what they paid for under the
// old terms. The floor is applied in the query, above the overridable window,
// so no hand-typed ?minDays can reach past it into history.
//
// IDEMPOTENCY: conversations.credit_refunded_at is the ledger. The update is
// guarded on it being null, so the rows this run actually claims are exactly
// the rows it credits. If the credit write then fails, the marks are rolled
// back so the next run retries rather than the player silently losing it.

const DAY = 86_400_000

/** Query param as a whole number ≥ 1, falling back on anything else. */
function positiveIntParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

type Conv = {
  id: string
  player_id: string
  coach_id: string
  initiated_by: string | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  // Widens the window by hand when needed. It cannot reach past
  // REFUND_ELIGIBLE_FROM — that floor is applied separately below. Parsed
  // defensively: a NaN here would otherwise become an Invalid Date cutoff that
  // silently matches nothing.
  const minDays = positiveIntParam(url, 'minDays', REFUND_AFTER_DAYS)
  const maxRefunds = positiveIntParam(url, 'max', MAX_REFUNDS_PER_RUN)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cutoff = new Date(Date.now() - minDays * DAY).toISOString()

  // +1 so we can tell a full page from a coincidentally exact one and report
  // truncation honestly rather than claiming the backlog is clear.
  const { data: rows, error: convErr } = await supabase
    .from('conversations')
    .select('id, player_id, coach_id, initiated_by, created_at')
    .is('coach_replied_at', null)
    .is('credit_refunded_at', null)
    .gte('created_at', REFUND_ELIGIBLE_FROM)   // the floor — never retroactive
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(maxRefunds + 1)

  if (convErr) {
    reportError('/api/cron/message-credit-refund', convErr, 'failed to load conversations')
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }

  // Only conversations the PLAYER paid to open. Coach-initiated threads cost
  // nothing, and migrated Glide threads have a null initiated_by — neither has
  // a credit to give back. PostgREST can't compare two columns, so this is the
  // one filter that has to happen here rather than in the query.
  const all = ((rows ?? []) as Conv[]).filter(c => c.initiated_by && c.initiated_by === c.player_id)
  const truncated = all.length > maxRefunds
  const eligible = truncated ? all.slice(0, maxRefunds) : all

  const byPlayer = new Map<string, string[]>()
  for (const c of eligible) {
    const list = byPlayer.get(c.player_id)
    if (list) list.push(c.id)
    else byPlayer.set(c.player_id, [c.id])
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      // Echoed so a hand-typed override that failed to parse is visible in the
      // output instead of silently falling back to the default.
      minDays,
      maxRefunds,
      eligibleFrom: REFUND_ELIGIBLE_FROM,
      scanned: rows?.length ?? 0,
      wouldRefund: eligible.length,
      players: byPlayer.size,
      truncated,
      preview: eligible.slice(0, 10).map(c => ({
        waitedDays: Math.floor((Date.now() - new Date(c.created_at).getTime()) / DAY),
      })),
    })
  }

  const now = new Date().toISOString()
  let refunded = 0
  let failed = 0
  const notifications: Array<{
    recipient_id: string
    actor_id: null
    type: string
    entity_type: null
    entity_id: null
    message: string
  }> = []

  for (const [playerId, convIds] of byPlayer) {
    // Claim the rows first. The `is null` guard means a concurrent run (or a
    // retry of this one) can't claim the same conversation twice, and the
    // returned rows are exactly what this run is responsible for crediting.
    const { data: claimed, error: claimErr } = await supabase
      .from('conversations')
      .update({ credit_refunded_at: now })
      .in('id', convIds)
      .is('credit_refunded_at', null)
      .select('id')

    if (claimErr) {
      reportError('/api/cron/message-credit-refund', claimErr, `claim failed for player ${playerId}`)
      failed += convIds.length
      continue
    }

    const amount = claimed?.length ?? 0
    if (amount === 0) continue

    const { error: creditErr } = await supabase.rpc('add_message_credits', {
      p_user_id: playerId,
      p_amount: amount,
    })

    if (creditErr) {
      // Release the claim so the next run tries again. Losing a credit the
      // player earned is the one failure mode this whole feature exists to
      // prevent — an extra day's delay is a far better outcome.
      await supabase
        .from('conversations')
        .update({ credit_refunded_at: null })
        .in('id', claimed!.map(c => c.id))
      reportError('/api/cron/message-credit-refund', creditErr, `credit failed for player ${playerId} (${amount})`)
      failed += amount
      continue
    }

    refunded += amount
    notifications.push({
      recipient_id: playerId,
      actor_id: null,
      type: 'message_credit_refunded',
      entity_type: null,
      entity_id: null,
      message: refundNotificationMessage(amount),
    })
  }

  // One notification per player per run, never one per conversation.
  let notified = 0
  if (notifications.length > 0) {
    const { error: notifErr } = await supabase.from('notifications').insert(notifications)
    if (notifErr) {
      // Non-fatal: the credit is the point, the notification is the courtesy.
      reportError('/api/cron/message-credit-refund', notifErr, 'failed to insert refund notifications')
    } else {
      notified = notifications.length
    }
  }

  return NextResponse.json({
    minDays,
    maxRefunds,
    scanned: rows?.length ?? 0,
    refunded,
    failed,
    players: byPlayer.size,
    notified,
    truncated,
  })
}
