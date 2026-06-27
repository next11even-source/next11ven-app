import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LinkSchema = z.object({
  profileId: z.string().min(1),
  team: z.coerce.number().int().positive(),
  squadNumber: z.coerce.number().int().positive(),
})

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST: link a profile to a teamsheet slot
export async function POST(req: Request) {
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

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = LinkSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const { profileId, team, squadNumber } = parsed.data

  const supa = serviceSupabase()

  // Clear any existing player in this slot first
  await supa.from('profiles')
    .update({ showcase_team: null, showcase_squad_number: null })
    .eq('showcase_team', team)
    .eq('showcase_squad_number', squadNumber)

  const { error } = await supa.from('profiles')
    .update({
      showcase_team: team,
      showcase_squad_number: squadNumber,
      showcase_attended: true,
    })
    .eq('id', profileId)

  if (error) {
    console.error('[showcase/link]', error)
    return NextResponse.json({ error: 'Failed to link profile' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET: search profiles by name for the inline admin search
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, position, club, avatar_url')
    .ilike('full_name', `%${q}%`)
    .eq('approved', true)
    .limit(6)

  return NextResponse.json({ results: data ?? [] })
}
