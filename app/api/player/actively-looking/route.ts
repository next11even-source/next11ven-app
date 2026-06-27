import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const ActivelyLookingSchema = z.object({
  actively_looking: z.boolean(),
})

async function getSupabase() {
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

export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, premium, actively_looking, position, city')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })

  let nearbyCoachCount: number | null = null

  if (!profile.premium && (profile.position || profile.city)) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    let coachQuery = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'coach')
      .eq('approved', true)
      .gte('last_active', weekAgo)

    if (profile.city) {
      coachQuery = coachQuery.eq('city', profile.city)
    }

    const { count } = await coachQuery

    if (profile.position) {
      const { count: oppCount } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('position', profile.position)
        .gte('created_at', weekAgo)

      const coachesFromCity = count ?? 0
      const oppsForPosition = oppCount ?? 0
      const total = coachesFromCity + oppsForPosition
      nearbyCoachCount = total > 0 ? total : null
    } else {
      nearbyCoachCount = count && count > 0 ? count : null
    }
  }

  return NextResponse.json({
    actively_looking: profile.actively_looking,
    nearbyCoachCount,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = ActivelyLookingSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'actively_looking must be a boolean' }, { status: 400 })
  }
  const body = parsed.data

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, premium')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })

  if (body.actively_looking && !profile.premium) {
    return NextResponse.json({ error: 'NOT_PREMIUM' }, { status: 403 })
  }

  await supabase
    .from('profiles')
    .update({ actively_looking: body.actively_looking })
    .eq('id', user.id)

  return NextResponse.json({ actively_looking: body.actively_looking })
}
