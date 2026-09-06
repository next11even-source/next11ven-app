import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { onUserApproved } from '@/lib/mailerlite'
import { reportError } from '@/lib/alert'
import { z } from 'zod'
import { isNativeOnboardingEnabled } from '@/lib/flowSettings'

const ReviewSchema = z.object({
  user_id: z.string().min(1),
  action: z.enum(['approve', 'decline']),
})

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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ReviewSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'user_id and action (approve|decline) are required' }, { status: 400 })
  }
  const { user_id, action } = parsed.data

  const isApproving = action === 'approve'

  // All DB writes use service role to bypass RLS
  const service = serviceSupabase()

  const { data: target } = await service
    .from('profiles')
    .select('email, full_name, first_name, last_name, role, city, phone, sms_opt_in')
    .eq('id', user_id)
    .single()

  const { error } = await service
    .from('profiles')
    .update({
      approved: isApproving,
      approval_status: isApproving ? 'approved' : 'declined',
    })
    .eq('id', user_id)

  if (error) {
    console.error('[Admin] review update error:', error)
    reportError('/api/admin/review', error, `user_id: ${user_id}, action: ${action}`)
    return NextResponse.json({ error: 'Failed to update approval status' }, { status: 500 })
  }

  // Onboarding sequence: mutually exclusive — native drip_jobs OR MailerLite, never both.
  // native_onboarding flag defaults false (fail-safe: DB error → MailerLite runs).
  // Flip to true in feature_flags table to cut over; flip back to roll back without redeploy.
  if (isApproving && target?.email) {
    const useNative = await isNativeOnboardingEnabled(service)
    if (useNative) {
      // Native onboarding: insert drip_jobs rows. The drip-reminders cron
      // (daily 09:00 UTC) picks them up and sends the emails.
      // Partial unique index drip_jobs_onboarding_unique prevents duplicates
      // for steps 10–21 — a double-click or retried request is silently ignored.
      const isCoach = target.role === 'coach'
      const now = new Date()
      const steps = isCoach
        ? [
            { step: 14, daysDelay: 0 },   // D0 welcome
            { step: 15, daysDelay: 2 },   // D2 post-your-role
            { step: 16, daysDelay: 5 },   // D5 proof
            // Step 17 deliberately absent — coach_activation_d7 owns day 7
            // for coaches who still haven't posted. See TOUCHPOINTS.md.
          ]
        : [
            { step: 10, daysDelay: 0 },   // D0 welcome
            { step: 11, daysDelay: 1 },   // D1 profile nudge
            { step: 12, daysDelay: 3 },   // D3 coaches are here
            { step: 13, daysDelay: 7 },   // D7 premium pitch
          ]

      const rows = steps.map(({ step, daysDelay }) => ({
        recipient_id: user_id,
        sequence_step: step,
        send_at: new Date(now.getTime() + daysDelay * 86_400_000).toISOString(),
      }))

      const { error: insertErr } = await service
        .from('drip_jobs')
        .upsert(rows, { onConflict: 'recipient_id,sequence_step', ignoreDuplicates: true })

      if (insertErr) {
        // Log but don't fail the approval — MailerLite fallback is gone at this point,
        // so a silent failure here means no onboarding email. Alert so it can be investigated.
        console.error('[review] drip_jobs onboarding insert failed:', insertErr)
        reportError('/api/admin/review', insertErr, `drip_jobs insert failed for user ${user_id}`)
      }
    } else {
      // Phase 1 (current): MailerLite handles onboarding sequences
      try {
        await onUserApproved({
          email: target.email,
          firstName: target.first_name,
          lastName: target.last_name,
          role: target.role,
          city: target.city ?? null,
        })
      } catch (err) {
        console.error('[MailerLite] onUserApproved error:', err)
      }
    }
  }

  // Approval SMS — non-blocking
  if (
    isApproving &&
    target?.phone &&
    target?.sms_opt_in !== false &&
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
    ).catch(err => {
      console.error('[Twilio] approval SMS error:', err)
      reportError('/api/admin/review', err, `twilio approval SMS failed for user_id: ${user_id}`)
    })
  }

  return NextResponse.json({ ok: true, action, user_id })
}
