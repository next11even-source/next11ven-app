import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendApplicationReceivedEmail } from '@/lib/email'

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

  // Verify caller is a player (or admin)
  const { data: sender } = await supabase
    .from('profiles')
    .select('role, full_name, premium')
    .eq('id', user.id)
    .single()

  if (!sender || !['player', 'admin'].includes(sender.role)) {
    return NextResponse.json({ error: 'Only players can apply to opportunities' }, { status: 403 })
  }

  if (!sender.premium) {
    return NextResponse.json({ error: 'Player Premium required to apply' }, { status: 403 })
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

  // Fetch opportunity + coach details
  const service = serviceSupabase()
  const { data: opp } = await service
    .from('opportunities')
    .select('id, title, coach_id, is_active')
    .eq('id', opportunity_id)
    .single()

  if (!opp || !opp.is_active) {
    return NextResponse.json({ error: 'Opportunity not found or closed' }, { status: 404 })
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

  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 })

  // Fetch coach email for notification (non-blocking)
  service
    .from('profiles')
    .select('email, full_name')
    .eq('id', opp.coach_id)
    .single()
    .then(({ data: coach }) => {
      if (coach?.email) {
        sendApplicationReceivedEmail({
          to: coach.email,
          coachName: coach.full_name,
          playerName: sender.full_name,
          opportunityTitle: opp.title,
        }).catch(err => console.error('[Email] application notification error:', err))
      }
    })

  return NextResponse.json({ application })
}
