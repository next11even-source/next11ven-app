import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Weekly active-user snapshot — Monday 07:00 UTC.
//
// Runs BEFORE the 08:00 metrics-telegram report so the snapshot is current
// when the weekly report fires. Snapshots the ISO week that just ended:
// previous Monday 00:00 UTC → this Monday 00:00 UTC.
//
// WINDOW DESIGN: anchored to fixed ISO week boundaries, NOT now()-7days.
// A rolling now()-7days window shifts which users are captured if the cron
// fires late: a user who logs in Monday morning (after the week boundary)
// would fall inside a rolling window but is correctly NOT part of the
// previous week. The fixed boundary is immune to cron timing drift —
// a late-firing cron captures the same set of users as an on-time one.
//
// IDEMPOTENT: upsert with ignoreDuplicates — safe to re-run for a given week.
//
// ⚠️ MONITORING REQUIRED: every missed week is a permanent gap in the cohort
// heatmap. last_sign_in_at is current-state only — missed weeks cannot be
// reconstructed. Alert on error responses or zero-row runs where activity
// is expected.
//
// Supports ?dryRun=1 — reports what would be inserted without writing.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  // Compute the ISO week boundaries for the week that just ended.
  // Cron fires on Monday — so "this Monday" is today, "last Monday" is 7d ago.
  // Both boundaries are midnight UTC so a user who logged in Monday morning
  // (after the week closed) is excluded from the previous week's snapshot.
  const now = new Date()
  const dayOfWeek = now.getUTCDay()  // 0=Sun, 1=Mon … 6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday))
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86_400_000)

  // ISO date strings "YYYY-MM-DD" used for the DB insert + window filter
  const weekStart = lastMonday.toISOString().slice(0, 10)
  const weekEnd   = thisMonday.toISOString().slice(0, 10)  // exclusive upper bound

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Get all approved users with their role from profiles.
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, role')
    .in('role', ['player', 'coach', 'admin'])
    .eq('approval_status', 'approved')

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.role as string]))

  // 2. Fetch auth users to get last_sign_in_at. listUsers doesn't support
  //    server-side date filtering, so we filter in JS. At ~200 users a single
  //    page fetch is fine; add pagination if user count grows past ~1000.
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({ perPage: 5000 })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // 3. Build snapshot rows: users whose last_sign_in_at falls within the
  //    closed calendar week [weekStart, weekEnd) AND are in profiles.
  const rows = (users ?? [])
    .filter(u => {
      if (!u.last_sign_in_at) return false
      const t = u.last_sign_in_at.slice(0, 10)  // compare date portions only
      return t >= weekStart && t < weekEnd && profileMap.has(u.id)
    })
    .map(u => ({
      week_start: weekStart,
      user_id:    u.id,
      role:       profileMap.get(u.id)!,
    }))

  if (dryRun) {
    return NextResponse.json({
      weekStart,
      weekEnd,
      wouldInsert: rows.length,
      dryRun: true,
      sample: rows.slice(0, 5),
    })
  }

  const { error: insertError } = await supabase
    .from('weekly_active_snapshots')
    .upsert(rows, { onConflict: 'week_start,user_id', ignoreDuplicates: true })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ weekStart, weekEnd, inserted: rows.length })
}
