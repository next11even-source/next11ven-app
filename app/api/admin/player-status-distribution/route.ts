import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'

export const runtime = 'nodejs'

// Returns current player status distribution from profiles.status directly.
// Deliberately NOT from status_change_log (an event log of transitions — only
// 12 rows as of Sep 2026, not a current-state picture).

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

  // Fetch all player/admin statuses (admin role counts as player per CLAUDE.md)
  const { data, error } = await supabase
    .from('profiles')
    .select('status')
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .not('status', 'is', null)
    .neq('status', '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.status) counts[row.status] = (counts[row.status] ?? 0) + 1
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const distribution = Object.entries(counts)
    .map(([status, count]) => ({
      status,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ distribution, total })
}
