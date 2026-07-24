import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import { z } from 'zod'

const SetAgentSchema = z.object({
  user_id: z.string().uuid(),
  is_agent: z.boolean(),
})

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()

  // Auth check uses the user's session (anon client)
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

  // Verify caller is admin
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

  const parsed = SetAgentSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'user_id and is_agent are required' }, { status: 400 })
  }
  const { user_id, is_agent } = parsed.data

  const service = serviceSupabase()

  // Only coaches can be agents — guard against flagging players/fans.
  const { data: target } = await service
    .from('profiles')
    .select('role')
    .eq('id', user_id)
    .single()

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role !== 'coach') {
    return NextResponse.json({ error: 'Only coaches can be marked as agents' }, { status: 400 })
  }

  const { error } = await service
    .from('profiles')
    .update({ is_agent })
    .eq('id', user_id)

  if (error) {
    console.error('[Admin] set-agent update error:', error)
    reportError('/api/admin/set-agent', error, `user_id: ${user_id}, is_agent: ${is_agent}`)
    return NextResponse.json({ error: 'Failed to update agent flag' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, is_agent })
}
