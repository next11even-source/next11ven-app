import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'

export const runtime = 'nodejs'

export async function GET() {
  const browser = createBrowserClient()
  const { data: { user } } = await browser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.rpc('analytics_player_views_monthly')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
