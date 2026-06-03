import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { playerId } = await req.json()
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const { error } = await supabase
    .from('profiles')
    .update({ showcase_attended: false })
    .eq('id', playerId)

  if (error) {
    console.error('[Showcase] remove error:', error)
    return NextResponse.json({ error: 'Failed to remove player' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
