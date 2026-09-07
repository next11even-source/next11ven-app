/**
 * Resend webhook receiver.
 * Resend signs webhooks with Svix. Verify the signature before trusting the payload.
 * One row per event is inserted into email_events for analytics.
 *
 * Events handled: email.sent, email.delivered, email.opened,
 *   email.clicked, email.bounced, email.complained
 *
 * Required env var: RESEND_WEBHOOK_SECRET (from Resend dashboard → Webhooks)
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const HANDLED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
])

export async function POST(req: NextRequest) {
  // 1. Verify Svix signature using the raw body (never the parsed JSON)
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const svixId        = req.headers.get('svix-id')        ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  const rawBody = await req.text()

  let payload: Record<string, unknown>
  try {
    const wh = new Webhook(secret)
    // Svix v2: verify() throws on failure but returns undefined — parse body ourselves
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch (err) {
    console.warn('[resend-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 2. Extract fields
  const eventType = typeof payload.type === 'string' ? payload.type : null
  if (!eventType || !HANDLED_EVENTS.has(eventType)) {
    // Unhandled event type — acknowledge receipt, do nothing
    return NextResponse.json({ received: true })
  }

  const data = (payload.data ?? {}) as Record<string, unknown>
  const resendEmailId = typeof data.email_id === 'string' ? data.email_id : null
  if (!resendEmailId) {
    return NextResponse.json({ received: true })
  }

  // Resend sends tags as an object in webhook payloads: { flow: 'drip_day0' }
  // (The send API accepts an array; the webhook flattens it to an object)
  const tags = data.tags as Record<string, string> | null | undefined
  const flow = typeof tags?.flow === 'string' ? tags.flow : null

  // to[0] is the recipient email address
  const toList = Array.isArray(data.to) ? data.to : []
  const recipientEmail = typeof toList[0] === 'string' ? toList[0] : null

  // Use created_at from payload if available, otherwise now
  const occurredAt = typeof data.created_at === 'string' ? data.created_at : new Date().toISOString()

  // 3. Look up recipient_id from profiles (best-effort — if not found, store null)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let recipientId: string | null = null
  if (recipientEmail) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', recipientEmail)
      .maybeSingle()
    recipientId = profile?.id ?? null
  }

  // 4. Insert event row
  const { error } = await supabase.from('email_events').insert({
    resend_email_id: resendEmailId,
    event_type: eventType,
    flow,
    recipient_id: recipientId,
    occurred_at: occurredAt,
    raw: payload,
  })

  if (error) {
    console.error('[resend-webhook] insert failed:', error)
    // Still return 200 so Resend doesn't retry endlessly for a write error
  }

  return NextResponse.json({ received: true })
}
