import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { COMPETITION_TYPES, MATCH_TAGS } from '@/lib/performance'
import { POSITIONS } from '@/lib/positions'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Same field rules as create, all optional — partial edit.
const MatchPatchSchema = z.object({
  match_date: z.string().regex(DATE, 'Invalid date').refine(
    d => new Date(`${d}T00:00:00Z`).getTime() <= Date.now() + 86400000,
    { message: 'Match date is in the future' }
  ),
  opponent: z.string().trim().min(1).max(60),
  competition_type: z.enum(COMPETITION_TYPES),
  competition_name: z.string().trim().max(60).nullable(),
  stint_id: z.string().min(1).nullable(),
  goals_for: z.number().int().min(0).max(99).nullable(),
  goals_against: z.number().int().min(0).max(99).nullable(),
  started: z.boolean(),
  position: z.enum(POSITIONS).nullable(),
  minutes_played: z.number().int().min(0).max(120).nullable(),
  goals: z.number().int().min(0).max(30),
  assists: z.number().int().min(0).max(30),
  penalty_saves: z.number().int().min(0).max(5),
  rating: z.number().min(1).max(10).multipleOf(0.5).nullable(),
  notes: z.string().max(2000).nullable(),
  tags: z.array(z.enum(MATCH_TAGS)).max(MATCH_TAGS.length),
}).partial()

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  const { data, error } = await gate.supabase
    .from('performance_matches')
    .select('*, club_stints(id, club_name, level, stint_type)')
    .eq('id', id)
    .eq('player_id', gate.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to load match' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  return NextResponse.json({ match: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = MatchPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid match entry' }, { status: 400 })
  }
  const body = parsed.data
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

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
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to update match' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  return NextResponse.json({ match: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  const { data, error } = await gate.supabase
    .from('performance_matches')
    .delete()
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  return NextResponse.json({ deleted: true })
}
