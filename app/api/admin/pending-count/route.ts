/**
 * GET /api/admin/pending-count
 *
 * Number of signups still awaiting approval — the badge on the admin tab in
 * BottomNav.
 *
 * Exists because that count was previously read straight from the browser with
 * `profiles.select('id').eq('approval_status','pending')`. That is a cross-user
 * read of UNAPPROVED rows, so it cannot come from the public_profiles view
 * (which deliberately excludes approval_status), and after 20260825000006
 * narrows the table to own-row it could not come from the client at all.
 *
 * Service role, gated on the caller actually being an admin.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'pending')

  return NextResponse.json({ count: count ?? 0 })
}
