import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { COMPETITION_TYPES, MATCH_TAGS, seasonRange } from '@/lib/performance'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const MatchSchema = z.object({
  match_date: z.string().regex(DATE, 'Invalid date'),
  opponent: z.string().trim().min(1).max(60),
  competition_type: z.enum(COMPETITION_TYPES),
  competition_name: z.string().trim().max(60).nullable().optional(),
  stint_id: z.string().min(1).nullable().optional(),
  goals_for: z.number().int().min(0).max(99).nullable().optional(),
  goals_against: z.number().int().min(0).max(99).nullable().optional(),
  started: z.boolean(),
  position: z.string().trim().max(40).nullable().optional(),
  minutes_played: z.number().int().min(0).max(120).nullable().optional(),
  goals: z.number().int().min(0).max(30).default(0),
  assists: z.number().int().min(0).max(30).default(0),
  rating: z.number().min(1).max(10).multipleOf(0.5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.enum(MATCH_TAGS)).max(MATCH_TAGS.length).default([]),
}).refine(
  m => new Date(`${m.match_date}T00:00:00Z`).getTime() <= Date.now() + 86400000,
  { message: 'Match date is in the future' }
)

export async function GET(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const params = req.nextUrl.searchParams
  const season = params.get('season')
  const competitionType = params.get('competition_type')
  const stintId = params.get('stint_id')
  const tag = params.get('tag')
  const limit = Math.min(parseInt(params.get('limit') ?? '50', 10) || 50, 200)
  const offset = parseInt(params.get('offset') ?? '0', 10) || 0

  let query = gate.supabase
    .from('performance_matches')
    .select('*', { count: 'exact' })
    .eq('player_id', gate.userId)
    .order('match_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (season && /^\d{4}$/.test(season)) {
    const { from, to } = seasonRange(parseInt(season, 10))
    query = query.gte('match_date', from).lte('match_date', to)
  }
  if (competitionType && (COMPETITION_TYPES as readonly string[]).includes(competitionType)) {
    query = query.eq('competition_type', competitionType)
  }
  if (stintId) query = query.eq('stint_id', stintId)
  if (tag && (MATCH_TAGS as readonly string[]).includes(tag)) {
    query = query.contains('tags', [tag])
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load matches' }, { status: 500 })

  return NextResponse.json({ matches: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = MatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid match entry' }, { status: 400 })
  }
  const body = parsed.data

  // RLS also rejects a stint that isn't the player's own; checking here first
  // returns a clean 400 instead of a generic insert failure.
  if (body.stint_id) {
    const { data: stint } = await gate.supabase
      .from('club_stints')
      .select('id')
      .eq('id', body.stint_id)
      .eq('player_id', gate.userId)
      .maybeSingle()
    if (!stint) return NextResponse.json({ error: 'Invalid stint' }, { status: 400 })
  }

  const { data, error } = await gate.supabase
    .from('performance_matches')
    .insert({ ...body, player_id: gate.userId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to log match' }, { status: 500 })

  return NextResponse.json({ match: data }, { status: 201 })
}
