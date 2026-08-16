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

type RawEvent = {
  type: string
  occurred_at: string
  headline: string
  profile_ids: string[]
}

export async function GET() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.rpc('analytics_event_feed')

  if (error) {
    console.error('[event-feed]', error)
    return NextResponse.json({ error: 'Failed to fetch event feed' }, { status: 500 })
  }

  // Same pattern as coach-leaderboard: filter seed/test accounts post-query
  // rather than duplicating HIDDEN_PROFILE_IDS in SQL.
  const hidden = new Set<string>(HIDDEN_PROFILE_IDS)
  const events = (data as RawEvent[])
    .filter(e => !e.profile_ids.some(id => hidden.has(id)))
    .map(({ type, occurred_at, headline }) => ({ type, occurred_at, headline }))

  return NextResponse.json({ events })
}
