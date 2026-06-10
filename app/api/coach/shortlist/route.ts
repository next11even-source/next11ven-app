import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

// GET /api/coach/shortlist — return the authenticated coach's full shortlist
export async function GET() {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: coach } = await supabase
    .from('profiles')
    .select('role, premium')
    .eq('id', user.id)
    .single()

  if (!coach || !['coach'].includes(coach.role)) {
    return NextResponse.json({ error: 'Coach account required' }, { status: 403 })
  }

  if (!coach.premium) {
    return NextResponse.json({ saved: [] })
  }

  const service = serviceSupabase()

  const { data: rows, error } = await service
    .from('coach_saved_players')
    .select(`
      id, player_id, folder_name, created_at,
      player:profiles!player_id(id, full_name, avatar_url, position, club, city, status, playing_level)
    `)
    .eq('coach_id', user.id)
    .order('folder_name')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Shortlist GET]', error)
    return NextResponse.json({ error: 'Failed to load shortlist' }, { status: 500 })
  }

  return NextResponse.json({ saved: rows ?? [] })
}

// POST /api/coach/shortlist — add a player to the coach's shortlist
export async function POST(req: NextRequest) {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: coach } = await supabase
    .from('profiles')
    .select('role, premium')
    .eq('id', user.id)
    .single()

  if (!coach || !['coach'].includes(coach.role)) {
    return NextResponse.json({ error: 'Coach account required' }, { status: 403 })
  }

  if (!coach.premium) {
    return NextResponse.json({ error: 'Coach Pro required to shortlist players' }, { status: 403 })
  }

  let body: { player_id?: string; folder_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { player_id, folder_name = 'Shortlist' } = body
  if (!player_id) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  const service = serviceSupabase()

  // Verify player exists and is approved
  const { data: player } = await service
    .from('profiles')
    .select('id, full_name, role, approved')
    .eq('id', player_id)
    .single()

  if (!player || !['player', 'admin'].includes(player.role) || !player.approved) {
    return NextResponse.json({ error: 'Player not found or not approved' }, { status: 404 })
  }

  // Check for duplicate
  const { data: existing } = await service
    .from('coach_saved_players')
    .select('id')
    .eq('coach_id', user.id)
    .eq('player_id', player_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Player already on your shortlist' }, { status: 409 })
  }

  // Insert shortlist entry
  const { data: entry, error: insertErr } = await service
    .from('coach_saved_players')
    .insert({ coach_id: user.id, player_id, folder_name: folder_name.trim() || 'Shortlist' })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'Player already on your shortlist' }, { status: 409 })
    }
    console.error('[Shortlist POST] insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to add player to shortlist' }, { status: 500 })
  }

  // Notify the player (best-effort — non-blocking)
  try {
    await service.from('notifications').insert({
      recipient_id: player_id,
      actor_id: user.id,
      type: 'shortlisted',
      entity_id: user.id,
      entity_type: 'profile',
      message: 'A coach added you to their shortlist',
    })
  } catch (err) {
    console.error('[Shortlist POST] notification error:', err)
  }

  return NextResponse.json({ entry }, { status: 201 })
}
