import { createServerClient } from '@supabase/ssr'
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

  // Parse body safely
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

  // Get sender profile
  const { data: sender } = await supabase
    .from('profiles')
    .select('role, full_name, premium')
    .eq('id', user.id)
    .single()

  if (!sender) return NextResponse.json({ error: 'Sender profile not found' }, { status: 403 })

  const isCoach = sender.role === 'coach'
  const isPlayer = sender.role === 'player'

  if (!isCoach && !isPlayer) {
    return NextResponse.json({ error: 'Only coaches and players can send messages' }, { status: 403 })
  }

  // Determine coach_id / player_id for the conversation
  let convCoachId: string
  let convPlayerId: string
  let isRequest = false

  if (isCoach) {
    if (!player_id) return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
    convCoachId = user.id
    convPlayerId = player_id
  } else {
    // Player sending — goes into coach's requests
    if (!coach_id) return NextResponse.json({ error: 'coach_id is required' }, { status: 400 })
    convCoachId = coach_id
    convPlayerId = user.id
    isRequest = true
  }

  // Verify recipient exists and is approved
  const { data: recipientCheck } = await supabase
    .from('profiles')
    .select('id, approved')
    .eq('id', isCoach ? convPlayerId : convCoachId)
    .single()

  if (!recipientCheck) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
  }
  if (!recipientCheck.approved) {
    return NextResponse.json({ error: 'Recipient account is not active' }, { status: 403 })
  }

  // Get or create conversation
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, initiated_by')
    .eq('coach_id', convCoachId)
    .eq('player_id', convPlayerId)
    .maybeSingle()

  let conversationId = existingConv?.id

  if (!conversationId) {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        coach_id: convCoachId,
        player_id: convPlayerId,
        initiated_by: user.id,
      })
      .select('id')
      .single()
    if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })
    conversationId = newConv.id
  }

  // Insert message
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
    })
    .select()
    .single()

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // Fetch recipient for notifications
  const recipientId = isCoach ? convPlayerId : convCoachId
  const { data: recipient } = await supabase
    .from('profiles')
    .select('phone, sms_opt_in, full_name, email')
    .eq('id', recipientId)
    .single()

  if (
    process.env.TWILIO_ENABLED !== 'false' &&
    recipient?.phone &&
    recipient?.sms_opt_in &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    try {
      const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
      const smsBody = isCoach
        ? `NEXT11VEN: You have a new message from a coach. Open the app to read it. ${appUrl}/dashboard/player/messages`
        : `NEXT11VEN: A player has sent you a message. Open the app to view it. ${appUrl}/dashboard/coach/messages`

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
            To: recipient.phone,
            Body: smsBody,
          }),
        }
      )
    } catch {
      // SMS failure is non-blocking
    }
  }

  // Email notification — non-blocking
  if (recipient?.email) {
    sendMessageNotificationEmail({
      to: recipient.email,
      toName: recipient.full_name,
      fromName: sender.full_name,
      isCoach: !isCoach, // recipient is coach if sender is player, vice versa
    }).catch(err => console.error('[Email] message notification error:', err))
  }

  return NextResponse.json({ message, conversationId, isRequest })
}
