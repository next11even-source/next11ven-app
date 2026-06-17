import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendApplicationReceivedEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

  // Verify caller is a player, admin, or coach
  const { data: sender } = await supabase
    .from('profiles')
    .select('role, full_name, premium')
    .eq('id', user.id)
    .single()

  const isCoach = sender?.role === 'coach'
  const isPlayerLike = sender?.role === 'player' || sender?.role === 'admin'
  if (!sender || (!isCoach && !isPlayerLike)) {
    return NextResponse.json({ error: 'Only players and coaches can apply to opportunities' }, { status: 403 })
  }

  let body: { opportunity_id?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { opportunity_id, message } = body
  if (!opportunity_id) {
    return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 })
  }
  if (message && message.trim().length > 2000) {
    return NextResponse.json({ error: 'Message must be 2000 characters or fewer' }, { status: 400 })
  }

  // Fetch opportunity + coach details
  const service = serviceSupabase()
  const { data: opp } = await service
    .from('opportunities')
    .select('id, title, coach_id, is_active, opportunity_type')
    .eq('id', opportunity_id)
    .single()

  if (!opp || !opp.is_active) {
    return NextResponse.json({ error: 'Opportunity not found or closed' }, { status: 404 })
  }

  // Coaches may only apply to coaching-staff roles, and never their own
  if (isCoach) {
    if (opp.opportunity_type !== 'coach') {
      return NextResponse.json({ error: 'Coaches can only apply to coaching-staff roles' }, { status: 403 })
    }
    if (opp.coach_id === user.id) {
      return NextResponse.json({ error: 'You cannot apply to your own opportunity' }, { status: 400 })
    }
  }

  // Applying is a premium feature for both roles
  if (!sender.premium) {
    reportError('/api/applications/apply', 'Non-premium applicant hit paywall', `applicant_id: ${user.id}, role: ${sender.role}`)
    return NextResponse.json(
      { error: isCoach ? 'Coach Pro required to apply' : 'Player Premium required to apply' },
      { status: 403 }
    )
  }

  // Rate limit: 10 applications per hour per applicant
  const since1h = new Date(Date.now() - 3_600_000).toISOString()
  const { count: recentApps } = await service
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', user.id)
    .gte('created_at', since1h)
  if ((recentApps ?? 0) >= 10) {
    return NextResponse.json({ error: 'Too many applications. Please try again later.' }, { status: 429 })
  }

  // Check for duplicate application
  const { data: existing } = await service
    .from('applications')
    .select('id')
    .eq('opportunity_id', opportunity_id)
    .eq('player_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already applied' }, { status: 409 })
  }

  // Insert application
  const { data: application, error: appErr } = await service
    .from('applications')
    .insert({
      opportunity_id,
      player_id: user.id,
      coach_id: opp.coach_id,
      message: message?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()

  if (appErr) {
    // Unique constraint violation — concurrent duplicate request
    if (appErr.code === '23505') {
      return NextResponse.json({ error: 'Already applied' }, { status: 409 })
    }
    console.error('[Apply] insert error:', appErr)
    reportError('/api/applications/apply', appErr, `opportunity_id: ${opportunity_id}`)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }

  // Fetch coach email and send notification — awaited before function exits
  try {
    const { data: coach } = await service
      .from('profiles')
      .select('email, full_name')
      .eq('id', opp.coach_id)
      .single()
    if (coach?.email) {
      await sendApplicationReceivedEmail({
        to: coach.email,
        coachName: coach.full_name,
        playerName: sender.full_name,
        opportunityTitle: opp.title,
      })
    }
  } catch (err) {
    console.error('[Email] application notification error:', err)
  }

  return NextResponse.json({ application })
}
