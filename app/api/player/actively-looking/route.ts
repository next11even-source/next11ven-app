import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { positionsInSameCategory } from '@/lib/positions'

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

  // ── Live coach count with floor/widening (§6) ──────────────────────────────
  // Only computed for free players (the people we're converting). Returns a
  // count + scope, or null when even the widened frame is too thin — in which
  // case the client falls back to the static proof line. Never returns 0/1/2.
  const FLOOR = 3
  let liveCount: { n: number; scope: 'local' | 'position'; position: string | null } | null = null

  if (!profile.premium && (profile.position || profile.city)) {
    const now = Date.now()
    const weekAgo = new Date(now - 7 * 86400000).toISOString()
    const monthAgo = new Date(now - 30 * 86400000).toISOString()

    // The copy says a broad category ("midfielders", "defenders"), so the count
    // must span every position in that category — not just the player's exact
    // position. e.g. a left-back's count includes LB + RB + CB roles.
    const categoryPositions = positionsInSameCategory(profile.position)

    // Local frame: coaches active near you (city) + open roles for your position, 7d.
    let localCoaches = 0
    if (profile.city) {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'coach')
        .eq('approved', true)
        .eq('city', profile.city)
        .gte('last_active', weekAgo)
      localCoaches = count ?? 0
    }

    let localOpps = 0
    if (categoryPositions.length) {
      const { count } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('position', categoryPositions)
        .gte('created_at', weekAgo)
      localOpps = count ?? 0
    }

    const localTotal = localCoaches + localOpps

    if (localTotal >= FLOOR) {
      liveCount = { n: localTotal, scope: 'local', position: profile.position ?? null }
    } else {
      // Widened frame: position-level demand across the pyramid over 30 days —
      // always reads bigger than hyper-local.
      let widePositionOpps = 0
      if (categoryPositions.length) {
        const { count } = await supabase
          .from('opportunities')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .in('position', categoryPositions)
          .gte('created_at', monthAgo)
        widePositionOpps = count ?? 0
      }

      const { count: wideCoaches } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'coach')
        .eq('approved', true)
        .gte('last_active', monthAgo)

      const wideTotal = widePositionOpps + (wideCoaches ?? 0)

      if (wideTotal >= FLOOR) {
        liveCount = { n: wideTotal, scope: 'position', position: profile.position ?? null }
      }
      // else: leave null → client shows the static proof line.
    }
  }

  return NextResponse.json({
    actively_looking: profile.actively_looking,
    liveCount,
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
