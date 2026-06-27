import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const RemoveSchema = z.object({
  playerId: z.string().min(1, 'Missing playerId'),
})

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

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = RemoveSchema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  const { playerId } = parsed.data

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
