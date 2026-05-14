import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all applications for active opportunities in one query
  const { data: opps } = await admin
    .from('opportunities')
    .select('id')
    .eq('is_active', true)

  if (!opps?.length) return NextResponse.json({ counts: {} })

  const oppIds = opps.map(o => o.id)

  const { data: apps } = await admin
    .from('applications')
    .select('opportunity_id')
    .in('opportunity_id', oppIds)

  const counts: Record<string, number> = {}
  for (const id of oppIds) counts[id] = 0
  for (const a of apps ?? []) counts[a.opportunity_id] = (counts[a.opportunity_id] ?? 0) + 1

  return NextResponse.json({ counts })
}
