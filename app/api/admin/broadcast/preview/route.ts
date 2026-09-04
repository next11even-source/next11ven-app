import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getAudienceRecipients, type AudienceFilter } from '@/lib/broadcastAudience'
import { countRecentTouches } from '@/lib/touchpoint'

export async function GET(req: NextRequest) {
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

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const p = req.nextUrl.searchParams
  const filter: AudienceFilter = {
    role: (p.get('role') ?? 'all') as AudienceFilter['role'],
    tier: (p.get('tier') ?? 'all') as AudienceFilter['tier'],
    joined: (p.get('joined') ?? 'all') as AudienceFilter['joined'],
    activity: (p.get('activity') ?? 'all') as AudienceFilter['activity'],
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const recipients = await getAudienceRecipients(service, filter)
    const ids = recipients.map(r => r.id)
    const recentTouchCount = await countRecentTouches(service, ids, 'email', 24)

    return NextResponse.json({
      count: recipients.length,
      recentTouchCount,
      sample: recipients.slice(0, 5).map(r => r.email),
    })
  } catch (err) {
    console.error('[broadcast/preview] error:', err)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
}
