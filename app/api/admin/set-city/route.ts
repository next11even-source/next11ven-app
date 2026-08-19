import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import { isValidCity } from '@/lib/cities'
import { z } from 'zod'

const SetCitySchema = z.object({
  user_id: z.string().uuid(),
  city: z.string().min(1),
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

  const parsed = SetCitySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'user_id and city are required' }, { status: 400 })
  }
  const { user_id, city } = parsed.data

  if (!isValidCity(city)) {
    return NextResponse.json({ error: 'Please select a city from the list' }, { status: 400 })
  }

  const service = serviceSupabase()

  const { error } = await service
    .from('profiles')
    .update({ city })
    .eq('id', user_id)

  if (error) {
    console.error('[Admin] set-city update error:', error)
    reportError('/api/admin/set-city', error, `user_id: ${user_id}, city: ${city}`)
    return NextResponse.json({ error: 'Failed to update city' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, city })
}
