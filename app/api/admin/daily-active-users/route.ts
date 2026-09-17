import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const VALID_WINDOWS = ['7d', '28d', '6m', '1y'] as const
type Window = typeof VALID_WINDOWS[number]

export async function GET(req: Request) {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('window') ?? '7d'
  const window: Window = (VALID_WINDOWS as readonly string[]).includes(raw)
    ? raw as Window
    : '7d'

  const { data, error } = await supabase.rpc('analytics_daily_active_users', {
    p_window: window,
  })

  if (error) {
    console.error('[daily-active-users]', error)
    return NextResponse.json({ error: 'Failed to fetch daily active users' }, { status: 500 })
  }

  return NextResponse.json(data)
}
