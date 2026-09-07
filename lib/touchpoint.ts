/**
 * Touchpoint ledger — shared send-frequency governor across all email/SMS flows.
 *
 * Every automated and manual send calls logTouch() after a successful send.
 * The broadcast composer's dry-run calls countRecentTouches() to warn before firing.
 * Individual flows can call canSendTouch() to gate a send against the shared log.
 *
 * All functions are non-blocking on failure — a logging error never stops a send.
 * All reads/writes use the service-role client; this table is never exposed to clients.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type TouchChannel = 'email' | 'sms'

export type TouchFlow =
  | 'drip_day0'
  | 'drip_day3'
  | 'drip_day7'
  | 'winback'
  | 'payment_failed'
  | 'payment_failed_followup'
  | 'weekly_digest'
  | 'log_nudge'
  | 'application_nudge'
  | 'coach_recommendations'
  | 'application_decision'
  | 'shortlist_available'
  | 'broadcast'
  | 'coach_activation_d7'
  | 'coach_activation_d21'
  | 'coach_gone_quiet_d1'
  | 'coach_gone_quiet_d14'
  // Onboarding sequences (Phase 2 — drip_jobs steps 10–21)
  | 'player_onboarding_d0'
  | 'player_onboarding_d1'
  | 'player_onboarding_d3'
  | 'player_onboarding_d7'
  | 'coach_onboarding_d0'
  | 'coach_onboarding_d2'
  | 'coach_onboarding_d5'
  | 'player_pro_welcome'
  | 'coach_pro_welcome'
  // MailerLite automation entries — logged so cross-flow gap checks see them
  | 'mailerlite_player_onboarding'
  | 'mailerlite_coach_onboarding'
  | 'mailerlite_player_premium'
  | 'mailerlite_coach_premium'

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Record a successful send. Call this immediately after the send succeeds —
 * not before, so a failed send never claims a slot in the ledger.
 * Non-blocking: a write failure is logged but never throws.
 */
export async function logTouch(
  supabase: SupabaseClient,
  recipientId: string,
  channel: TouchChannel,
  flow: TouchFlow
): Promise<void> {
  const { error } = await supabase
    .from('touchpoint_log')
    .insert({ recipient_id: recipientId, channel, flow })
  if (error) {
    console.error('[touchpoint] logTouch failed:', error)
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Check whether a recipient can receive a send on the given channel.
 * Returns canSend: true if no touch was logged within minGapHours.
 * Fails open — if the query errors, the send is allowed through.
 */
export async function canSendTouch(
  supabase: SupabaseClient,
  recipientId: string,
  channel: TouchChannel,
  minGapHours: number
): Promise<{ canSend: boolean; lastSentAt: string | null; hoursAgo: number | null }> {
  const since = new Date(Date.now() - minGapHours * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('touchpoint_log')
    .select('sent_at')
    .eq('recipient_id', recipientId)
    .eq('channel', channel)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { canSend: true, lastSentAt: null, hoursAgo: null }
  }

  const hoursAgo = (Date.now() - new Date(data.sent_at).getTime()) / 3_600_000
  return { canSend: false, lastSentAt: data.sent_at, hoursAgo: Math.round(hoursAgo) }
}

/**
 * For the broadcast composer dry-run: given a list of recipient IDs, return
 * how many distinct recipients had a touch on the given channel within minGapHours.
 * Powers the pre-send warning: "48 of 200 recipients had an email in the last 24h."
 */
export async function countRecentTouches(
  supabase: SupabaseClient,
  recipientIds: string[],
  channel: TouchChannel,
  minGapHours: number
): Promise<number> {
  if (recipientIds.length === 0) return 0
  const since = new Date(Date.now() - minGapHours * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('touchpoint_log')
    .select('recipient_id')
    .in('recipient_id', recipientIds)
    .eq('channel', channel)
    .gte('sent_at', since)

  if (error || !data) return 0
  // Deduplicate — a recipient may have multiple touches within the window
  return new Set(data.map((r: { recipient_id: string }) => r.recipient_id)).size
}
