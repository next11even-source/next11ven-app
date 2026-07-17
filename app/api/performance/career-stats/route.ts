import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { seasonStartYear } from '@/lib/performance'
import { POSITIONS } from '@/lib/positions'

// Career stats = pre-platform history the player enters themselves (per-season
// summaries), distinct from the live match log. Owner-only via RLS; entry is
// free (it's the player's own record).
//
// GET also surfaces "orphaned" legacy stats: the old manual profiles.goals/
// assists/appearances that were never placeable to a season (null/garbage season
// string), so nothing was backfilled. The "place your season" nudge uses this —
// a STANDING mechanism, firing for anyone with legacy stats and no career rows,
// not a one-off cleanup.

const CAP = 150

const CareerStatSchema = z.object({
  season_start_year: z.number().int().min(1980).max(seasonStartYear() + 1),
  club_name: z.string().trim().max(60).nullable().optional(),
  level: z.string().trim().max(40).nullable().optional(),
  position: z.enum(POSITIONS).nullable().optional(),
  apps: z.number().int().min(0).max(CAP).nullable().optional(),
  goals: z.number().int().min(0).max(CAP).nullable().optional(),
  assists: z.number().int().min(0).max(CAP).nullable().optional(),
  minutes: z.number().int().min(0).max(100000).nullable().optional(),
  clean_sheets: z.number().int().min(0).max(CAP).nullable().optional(),
})

export async function GET() {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const [rowsRes, profileRes] = await Promise.all([
    gate.supabase
      .from('career_stats')
      .select('*')
      .eq('player_id', gate.userId)
      .order('season_start_year', { ascending: false }),
    gate.supabase
      .from('profiles')
      .select('goals, assists, appearances, season, club, playing_level, position')
      .eq('id', gate.userId)
      .single(),
  ])

  if (rowsRes.error) return NextResponse.json({ error: 'Failed to load career stats' }, { status: 500 })

  const rows = rowsRes.data ?? []
  const p = profileRes.data
  const hasLegacy = !!p && ((p.goals ?? 0) > 0 || (p.assists ?? 0) > 0 || (p.appearances ?? 0) > 0)

  // Orphaned = the player has old manual stats but no career rows to carry them.
  // These are the "place your season" customers. We prefill everything from the
  // legacy profile; the player only needs to supply the missing season.
  const legacy = hasLegacy && rows.length === 0 && p
    ? {
        goals: p.goals ?? 0,
        assists: p.assists ?? 0,
        appearances: p.appearances ?? 0,
        season: p.season ?? null,
        club_name: p.club ?? null,
        level: p.playing_level ?? null,
        position: p.position ?? null,
      }
    : null

  return NextResponse.json({ career: rows, legacy })
}

export async function POST(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = CareerStatSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid career entry' }, { status: 400 })
  }

  const { data, error } = await gate.supabase
    .from('career_stats')
    .insert({ ...parsed.data, player_id: gate.userId, source: 'self_reported' })
    .select()
    .single()

  if (error) {
    // Unique index (player_id, season_start_year, coalesce(club_name,'')) —
    // surface the duplicate cleanly rather than a 500.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already have an entry for that season and club' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to save career entry' }, { status: 500 })
  }

  return NextResponse.json({ careerStat: data })
}
