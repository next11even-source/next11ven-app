import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { HIDDEN_PROFILE_IDS } from '@/lib/hiddenProfiles'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type CoachRow = { id: string }

export async function GET() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.rpc('analytics_coach_leaderboard')

  if (error) {
    console.error('[coach-leaderboard]', error)
    return NextResponse.json({ error: 'Failed to fetch coach leaderboard' }, { status: 500 })
  }

  // Seed/test accounts stay out of the outreach list — filtered here rather
  // than in SQL so lib/hiddenProfiles.ts remains the single source of truth.
  const hidden = new Set<string>(HIDDEN_PROFILE_IDS)
  const coaches = ((data?.coaches ?? []) as CoachRow[]).filter(c => !hidden.has(c.id))

  return NextResponse.json({ ...data, coaches })
}
