import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [playersRes, coachesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, position, club, showcase_waitlist_joined_at')
      .eq('showcase_waitlist', true)
      .order('showcase_waitlist_joined_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, coaching_role, club, showcase_coach_waitlist_joined_at')
      .eq('showcase_coach_waitlist', true)
      .order('showcase_coach_waitlist_joined_at', { ascending: true }),
  ])

  return NextResponse.json({
    players: playersRes.data ?? [],
    coaches: coachesRes.data ?? [],
    total: (playersRes.data?.length ?? 0) + (coachesRes.data?.length ?? 0),
  })
}
