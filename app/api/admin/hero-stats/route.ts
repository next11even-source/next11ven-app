import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

const VALID_DAYS = [7, 14, 30, 90] as const

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rawDays = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)
  const p_days = (VALID_DAYS as readonly number[]).includes(rawDays) ? rawDays : 30

  const { data, error } = await supabase.rpc('analytics_hero_stats', { p_days })

  if (error) {
    console.error('[hero-stats]', error)
    return NextResponse.json({ error: 'Failed to fetch hero stats' }, { status: 500 })
  }

  return NextResponse.json(data)
}
