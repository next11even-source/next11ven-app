import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import { LEVELS } from '@/lib/levels'
import { z } from 'zod'

const SetLevelSchema = z.object({
  user_id: z.string().uuid(),
  level: z.string().min(1),
  // which field to update — derived from the profile's role server-side,
  // but the client tells us which it intends so we can validate the field name
  field: z.enum(['playing_level', 'coaching_level']),
})

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

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = SetLevelSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'user_id, level and field are required' }, { status: 400 })
  }
  const { user_id, level, field } = parsed.data

  if (!(LEVELS as readonly string[]).includes(level)) {
    return NextResponse.json({ error: 'Invalid level value' }, { status: 400 })
  }

  const service = serviceSupabase()

  const { error } = await service
    .from('profiles')
    .update({ [field]: level })
    .eq('id', user_id)

  if (error) {
    console.error('[Admin] set-level update error:', error)
    reportError('/api/admin/set-level', error, `user_id: ${user_id}, field: ${field}, level: ${level}`)
    return NextResponse.json({ error: 'Failed to update level' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, level })
}
