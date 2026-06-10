import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getRecommendedPlayers, logRecommendations } from '@/lib/recommendations'

const IN_APP_RECOMMENDATION_COUNT = 8

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

// GET /api/coach/recommendations — "Recommended for You" for the authed coach.
// Recomputed on every request from the latest search history (no rotation rule
// for the in-app surface). Each response is logged as in_app impressions.
export async function GET() {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'coach') {
    return NextResponse.json({ error: 'Coach account required' }, { status: 403 })
  }

  const service = serviceSupabase()

  try {
    const { players, hasSearchHistory } = await getRecommendedPlayers(
      service,
      user.id,
      'in_app',
      IN_APP_RECOMMENDATION_COUNT
    )

    // Best-effort impression logging — never block the response on it.
    logRecommendations(service, user.id, players.map(p => p.id), 'in_app').catch(err =>
      console.error('[recommendations GET] impression log failed:', err)
    )

    return NextResponse.json({ players, hasSearchHistory })
  } catch (err) {
    console.error('[recommendations GET]', err)
    return NextResponse.json({ error: 'Failed to load recommendations' }, { status: 500 })
  }
}
