import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendShortlistAvailableEmail } from '@/lib/email'

const VALID_STATUSES = ['free_agent', 'signed', 'loan_dual_reg', 'just_exploring'] as const

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: { status?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { status } = body
  if (!status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const service = serviceSupabase()

  const { data: profile } = await service
    .from('profiles')
    .select('role, status, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })

  const oldStatus = profile.status
  if (oldStatus === status) {
    return NextResponse.json({ status })
  }

  // DB trigger handles in-app notifications automatically on status change
  await service
    .from('profiles')
    .update({ status, last_active: new Date().toISOString() })
    .eq('id', user.id)

  // Email coaches who shortlisted this player (free_agent only, rate-limited)
  if (status === 'free_agent') {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const { data: coaches } = await service
      .from('coach_saved_players')
      .select('coach_id, coach:profiles!coach_id(email, full_name, email_marketing_opt_out)')
      .eq('player_id', user.id)

    if (coaches && coaches.length > 0) {
      const { data: recentNotifs } = await service
        .from('notifications')
        .select('recipient_id')
        .eq('actor_id', user.id)
        .eq('type', 'shortlist_availability')
        .gte('created_at', oneWeekAgo)

      const recentCoachIds = new Set((recentNotifs ?? []).map(n => n.recipient_id))

      const playerName = profile.full_name ?? 'A player'

      for (const row of coaches) {
        const coach = row.coach as any
        if (!coach?.email) continue
        if (coach.email_marketing_opt_out) continue
        if (recentCoachIds.has(row.coach_id)) continue

        sendShortlistAvailableEmail({
          to: coach.email,
          coachName: coach.full_name,
          playerName,
          playerId: user.id,
        }).catch(err => console.error('[Status change email]', err))
      }
    }
  }

  return NextResponse.json({ status })
}
