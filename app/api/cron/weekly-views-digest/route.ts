import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyViewsDigestFreeEmail, sendWeeklyViewsDigestPremiumEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 60

type ViewerEmbed = {
  role: string | null
  full_name: string | null
  club: string | null
}

type ViewRow = {
  player_id: string
  viewer_id: string
  viewer: ViewerEmbed | ViewerEmbed[] | null
}

type PlayerProfile = {
  id: string
  email: string | null
  full_name: string | null
  premium: boolean
  role: string | null
}

function resolveViewer(raw: ViewerEmbed | ViewerEmbed[] | null): ViewerEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all views from the past 7 days with each viewer's role, name and club.
  // player_views is the live table (not profile_views).
  const { data: views, error: viewsError } = await supabase
    .from('player_views')
    .select('player_id, viewer_id, viewer:viewer_id(role, full_name, club)')
    .gte('viewed_at', sevenDaysAgo)
    .limit(5000)

  if (viewsError) {
    console.error('[weekly-views-digest] views query error:', viewsError)
    reportError('/api/cron/weekly-views-digest', viewsError, 'failed to query player_views')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!views || views.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, reason: 'no views this week' })
  }

  // Build a map: player_id → Map<coach_id, { full_name, club }>
  // Only count viewers whose role is 'coach' — never count player-to-player views.
  const coachViewMap = new Map<string, Map<string, { full_name: string | null; club: string | null }>>()

  for (const row of views as unknown as ViewRow[]) {
    const viewer = resolveViewer(row.viewer)
    if (!viewer || viewer.role !== 'coach') continue

    if (!coachViewMap.has(row.player_id)) {
      coachViewMap.set(row.player_id, new Map())
    }
    // Use Set semantics via Map key — deduplicates multiple views from the same coach
    if (!coachViewMap.get(row.player_id)!.has(row.viewer_id)) {
      coachViewMap.get(row.player_id)!.set(row.viewer_id, {
        full_name: viewer.full_name ?? null,
        club: viewer.club ?? null,
      })
    }
  }

  const playerIds = Array.from(coachViewMap.keys())
  if (playerIds.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, reason: 'no coach views this week' })
  }

  // Fetch profiles for all players who received coach views.
  // Guard: only fetch players/admins — never coaches.
  const { data: players, error: playersError } = await supabase
    .from('profiles')
    .select('id, email, full_name, premium, role')
    .in('id', playerIds)
    .in('role', ['player', 'admin'])

  if (playersError) {
    console.error('[weekly-views-digest] profiles query error:', playersError)
    reportError('/api/cron/weekly-views-digest', playersError, 'failed to query profiles')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!players || players.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, reason: 'no eligible players' })
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const player of players as PlayerProfile[]) {
    if (!player.email) {
      skipped++
      continue
    }

    const coachesMap = coachViewMap.get(player.id)
    if (!coachesMap || coachesMap.size === 0) {
      skipped++
      continue
    }

    const coaches = Array.from(coachesMap.values())
    const coachCount = coaches.length

    try {
      if (player.premium) {
        await sendWeeklyViewsDigestPremiumEmail({
          to: player.email,
          toName: player.full_name,
          coachCount,
          coaches,
        })
      } else {
        await sendWeeklyViewsDigestFreeEmail({
          to: player.email,
          toName: player.full_name,
          coachCount,
        })
      }
      sent++
      console.log(`[weekly-views-digest] sent ${player.premium ? 'premium' : 'free'} email to ${player.email} (${coachCount} coach views)`)
    } catch (err) {
      console.error(`[weekly-views-digest] failed for player ${player.id}:`, err)
      reportError('/api/cron/weekly-views-digest', err, `email failed for player ${player.id}`)
      failed++
    }
  }

  console.log(`[weekly-views-digest] done — sent:${sent} skipped:${skipped} failed:${failed}`)
  return NextResponse.json({ sent, skipped, failed })
}
