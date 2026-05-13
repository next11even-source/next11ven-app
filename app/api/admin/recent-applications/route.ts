import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: apps, error } = await admin
    .from('applications')
    .select('id, created_at, status, message, player_id, coach_id, opportunity_id')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!apps?.length) return NextResponse.json({ applications: [] })

  const playerIds = [...new Set(apps.map(a => a.player_id))]
  const coachIds  = [...new Set(apps.map(a => a.coach_id))]
  const oppIds    = [...new Set(apps.map(a => a.opportunity_id))]

  const [playersRes, coachesRes, oppsRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, club, position').in('id', playerIds),
    admin.from('profiles').select('id, full_name, club').in('id', coachIds),
    admin.from('opportunities').select('id, title, club, position, level').in('id', oppIds),
  ])

  const playerMap = Object.fromEntries((playersRes.data ?? []).map(p => [p.id, p]))
  const coachMap  = Object.fromEntries((coachesRes.data ?? []).map(c => [c.id, c]))
  const oppMap    = Object.fromEntries((oppsRes.data ?? []).map(o => [o.id, o]))

  const applications = apps.map(a => ({
    id: a.id,
    created_at: a.created_at,
    status: a.status,
    message: a.message,
    player: playerMap[a.player_id] ?? null,
    coach: coachMap[a.coach_id] ?? null,
    opportunity: oppMap[a.opportunity_id] ?? null,
  }))

  return NextResponse.json({ applications })
}
