import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Coarse switch controlling whether a player's tracked stats show on their
// public profile (the objective aggregate only — notes/tags/ratings are never
// public regardless). Default on; free to toggle. No premium gate: visibility
// is free (Q6 — gate being FOUND, never being SEEN).

const VisibilitySchema = z.object({
  performance_stats_public: z.boolean(),
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
    .select('role, performance_stats_public')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })

  return NextResponse.json({ performance_stats_public: profile.performance_stats_public })
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = VisibilitySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'performance_stats_public must be a boolean' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })

  await supabase
    .from('profiles')
    .update({ performance_stats_public: parsed.data.performance_stats_public })
    .eq('id', user.id)

  return NextResponse.json({ performance_stats_public: parsed.data.performance_stats_public })
}
