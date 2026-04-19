import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { onUserApproved } from '@/lib/mailerlite'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()

  // Auth check uses the user's session (anon client)
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

  // Verify caller is admin
  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { user_id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { user_id, action } = body
  if (!user_id || !['approve', 'decline'].includes(action ?? '')) {
    return NextResponse.json({ error: 'user_id and action (approve|decline) are required' }, { status: 400 })
  }

  const isApproving = action === 'approve'

  // All DB writes use service role to bypass RLS
  const service = serviceSupabase()

  const { data: target } = await service
    .from('profiles')
    .select('email, full_name, role, city, location, phone, sms_opt_in')
    .eq('id', user_id)
    .single()

  const { error } = await service
    .from('profiles')
    .update({
      approved: isApproving,
      approval_status: isApproving ? 'approved' : 'declined',
    })
    .eq('id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire MailerLite — awaited so it completes before the serverless function returns
  if (isApproving && target?.email) {
    try {
      const city = [target.city, target.location].filter(Boolean).join(', ') || null
      await onUserApproved(target.email, target.full_name, target.role, city)
    } catch (err) {
      console.error('[MailerLite] onUserApproved error:', err)
    }
  }

  // Approval SMS — non-blocking
  if (
    isApproving &&
    target?.phone &&
    target?.sms_opt_in &&
    process.env.TWILIO_ENABLED !== 'false' &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
    const roleLabel = target.role === 'coach' ? 'coach' : target.role === 'fan' ? 'supporter' : 'player'
    const smsBody = `NEXT11VEN: Your ${roleLabel} account has been approved! Sign in now: ${appUrl}`
    fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: process.env.TWILIO_FROM_NUMBER,
          To: target.phone,
          Body: smsBody,
        }),
      }
    ).catch(err => console.error('[Twilio] approval SMS error:', err))
  }

  return NextResponse.json({ ok: true, action, user_id })
}
