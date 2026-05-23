import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
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

  if (me?.role !== 'coach') {
    return NextResponse.json({ error: 'Only coaches can confirm showcase attendance' }, { status: 403 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ showcase_confirmed: true, showcase_confirmed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[Showcase] confirm error:', error)
    return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
