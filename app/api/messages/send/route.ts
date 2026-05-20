import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendMessageNotificationEmail } from '@/lib/email'

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
    .select('id, approved, role, full_name, email, phone, sms_opt_in, coaching_role, position, last_sms_at')
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
      // Record timestamp — use service role to bypass RLS
      const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      await adminClient.from('profiles').update({ last_sms_at: new Date().toISOString() }).eq('id', recipientId)
    } catch {
      // non-blocking
    }
  }

  // Email — max 3 per day
  if (recipientProfile.email) {
    let emailAllowed = true
    try {
      const emailAdminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: recipientConvs } = await emailAdminClient
        .from('conversations')
        .select('id')
        .or(`coach_id.eq.${recipientId},player_id.eq.${recipientId}`)

      const convIds = recipientConvs?.map((c: { id: string }) => c.id) ?? []

      if (convIds.length > 0) {
        const { count } = await emailAdminClient
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', recipientId)
          .gte('created_at', todayStart.toISOString())

        if ((count ?? 0) > 3) emailAllowed = false
      }
    } catch {
      // fail open — if check errors, send the email
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

  return NextResponse.json({ message, conversationId, isRequest })
}
