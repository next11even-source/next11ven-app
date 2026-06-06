import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendMessageNotificationEmail, sendDripDay0Email } from '@/lib/email'
import { reportError } from '@/lib/alert'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: { player_id?: string; coach_id?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { player_id, coach_id, content } = body
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
  }
  if (content.trim().length > 2000) {
    return NextResponse.json({ error: 'Message must be 2000 characters or fewer' }, { status: 400 })
  }

  // Get sender profile
  const { data: sender } = await supabase
    .from('profiles')
    .select('role, full_name, premium')
    .eq('id', user.id)
    .single()

  if (!sender) return NextResponse.json({ error: 'Sender profile not found' }, { status: 403 })

  const senderIsCoach = sender.role === 'coach'
  const senderIsPlayer = sender.role === 'player' || sender.role === 'admin'

  if (!senderIsCoach && !senderIsPlayer) {
    return NextResponse.json({ error: 'Only coaches and players can send messages' }, { status: 403 })
  }

  // Recipient ID: accept either param name
  const recipientId = senderIsCoach ? (player_id ?? coach_id) : coach_id
  if (!recipientId) {
    return NextResponse.json({ error: 'Recipient ID is required' }, { status: 400 })
  }

  // Fetch recipient to verify and get role
  const { data: recipientProfile } = await supabase
    .from('profiles')
    .select('id, approved, role, full_name, email, phone, sms_opt_in, coaching_role, position, last_sms_at, premium')
    .eq('id', recipientId)
    .single()

  if (!recipientProfile) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
  if (!recipientProfile.approved) return NextResponse.json({ error: 'Recipient account is not active' }, { status: 403 })

  const recipientIsCoach = recipientProfile.role === 'coach'
  const isCoachToCoach = senderIsCoach && recipientIsCoach

  // Determine conversation slot assignment
  let convCoachId: string
  let convPlayerId: string
  let isRequest = false

  if (senderIsCoach) {
    if (isCoachToCoach) {
      // Canonical ordering for coach-to-coach: lower UUID in coach_id slot
      // ensures both sides always find the same conversation row
      if (user.id < recipientId) {
        convCoachId = user.id
        convPlayerId = recipientId
      } else {
        convCoachId = recipientId
        convPlayerId = user.id
      }
    } else {
      convCoachId = user.id
      convPlayerId = recipientId
    }
  } else {
    // Player → coach
    convCoachId = recipientId
    convPlayerId = user.id
    isRequest = true
  }

  // Get or create conversation
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, initiated_by')
    .eq('coach_id', convCoachId)
    .eq('player_id', convPlayerId)
    .maybeSingle()

  // Players can only reply — they cannot start new conversations with coaches
  if (senderIsPlayer && !existingConv) {
    reportError('/api/messages/send', 'Player attempted to initiate conversation', `player_id: ${user.id}, coach_id: ${recipientId}`)
    return NextResponse.json({ error: 'Players cannot initiate conversations with coaches' }, { status: 403 })
  }

  let conversationId = existingConv?.id

  if (!conversationId) {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({ coach_id: convCoachId, player_id: convPlayerId, initiated_by: user.id })
      .select('id')
      .single()
    if (convErr) {
      console.error('[Messages] conversation create error:', convErr)
      reportError('/api/messages/send', convErr, 'conversation create failed')
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }
    conversationId = newConv.id
  }

  // Insert message
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content: content.trim() })
    .select()
    .single()

  if (msgErr) {
    console.error('[Messages] insert error:', msgErr)
    reportError('/api/messages/send', msgErr, 'message insert failed')
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  const now = new Date().toISOString()
  await supabase
    .from('conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId)

  // If a coach sends into a player-initiated conversation that has no reply yet, mark it replied
  if (senderIsCoach && existingConv?.initiated_by && existingConv.initiated_by !== user.id) {
    await supabase
      .from('conversations')
      .update({ coach_replied_at: now })
      .eq('id', conversationId)
      .is('coach_replied_at', null)
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
  const recipientDashboardUrl = recipientIsCoach
    ? `${appUrl}/dashboard/coach/messages`
    : `${appUrl}/dashboard/player/messages`

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Drip-eligible: coach → non-premium player only
  const isDripEligible = senderIsCoach && !recipientIsCoach && recipientProfile.premium === false

  let usedDrip = false

  if (isDripEligible) {
    // Guard: only one active drip sequence per player at a time
    const { count: pendingDrip } = await adminClient
      .from('drip_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('sent', false)

    if (pendingDrip === 0) {
      usedDrip = true

      // Schedule Day 3 (email) and Day 7 (SMS + email) jobs
      const day3At = new Date(Date.now() + 3 * 86_400_000).toISOString()
      const day7At = new Date(Date.now() + 7 * 86_400_000).toISOString()
      await adminClient.from('drip_jobs').insert([
        { recipient_id: recipientId, message_id: message.id, sequence_step: 2, send_at: day3At },
        { recipient_id: recipientId, message_id: message.id, sequence_step: 3, send_at: day7At },
      ])

      // Day 0 — SMS (upgrade-specific copy)
      const lastSms = recipientProfile.last_sms_at ? new Date(recipientProfile.last_sms_at) : null
      const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > 86_400_000
      if (
        smsAllowed &&
        process.env.TWILIO_ENABLED !== 'false' &&
        recipientProfile.phone &&
        recipientProfile.sms_opt_in !== false &&
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
                To: recipientProfile.phone,
                Body: `NEXT11VEN: You have a new message from a coach. Upgrade to read it and reply — coaches won't wait. ${appUrl}/dashboard/player/premium`,
              }),
            }
          )
          await adminClient.from('profiles').update({ last_sms_at: new Date().toISOString() }).eq('id', recipientId)
        } catch (err) {
          reportError('/api/messages/send', err, `drip day0 SMS failed for recipient: ${recipientId}`)
        }
      }

      // Day 0 — email (upgrade-specific)
      if (recipientProfile.email) {
        try {
          await sendDripDay0Email({ to: recipientProfile.email, toName: recipientProfile.full_name })
        } catch (err) {
          reportError('/api/messages/send', err, `drip day0 email failed for recipient: ${recipientId}`)
        }
      }
    }
  }

  // Standard notifications for coaches, premium players, or when drip was already active
  if (!usedDrip) {
    // SMS — max 1 per recipient per day
    const lastSms = recipientProfile.last_sms_at ? new Date(recipientProfile.last_sms_at) : null
    const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > 86_400_000

    if (
      smsAllowed &&
      process.env.TWILIO_ENABLED !== 'false' &&
      recipientProfile.phone &&
      recipientProfile.sms_opt_in !== false &&
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
              To: recipientProfile.phone,
              Body: `NEXT11VEN: You have a new message. Open the app to read it. ${recipientDashboardUrl}`,
            }),
          }
        )
        await adminClient.from('profiles').update({ last_sms_at: new Date().toISOString() }).eq('id', recipientId)
      } catch (err) {
        reportError('/api/messages/send', err, `twilio SMS failed for recipient: ${recipientId}`)
      }
    }

    // Email — max 3 per day
    if (recipientProfile.email) {
      let emailAllowed = true
      try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const { data: recipientConvs } = await adminClient
          .from('conversations')
          .select('id')
          .or(`coach_id.eq.${recipientId},player_id.eq.${recipientId}`)

        const convIds = recipientConvs?.map((c: { id: string }) => c.id) ?? []

        if (convIds.length > 0) {
          const { count } = await adminClient
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .neq('sender_id', recipientId)
            .gte('created_at', todayStart.toISOString())

          if ((count ?? 0) > 3) emailAllowed = false
        }
      } catch {
        // fail open
      }

      if (emailAllowed) {
        try {
          await sendMessageNotificationEmail({
            to: recipientProfile.email,
            toName: recipientProfile.full_name,
            isCoach: recipientIsCoach,
          })
        } catch (err) {
          console.error('[Email] message notification error:', err)
        }
      }
    }
  }

  return NextResponse.json({ message, conversationId, isRequest })
}
