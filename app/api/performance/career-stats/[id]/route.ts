import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { seasonStartYear } from '@/lib/performance'
import { POSITIONS } from '@/lib/positions'

// Edit / delete a single career_stats row. Owner-only via RLS; entry is free
// (the player's own history). Pairs with the collection route's GET/POST.

const CAP = 150

const CareerStatPatchSchema = z.object({
  season_start_year: z.number().int().min(1980).max(seasonStartYear() + 1),
  club_name: z.string().trim().max(60).nullable(),
  level: z.string().trim().max(40).nullable(),
  position: z.enum(POSITIONS).nullable(),
  apps: z.number().int().min(0).max(CAP).nullable(),
  goals: z.number().int().min(0).max(CAP).nullable(),
  assists: z.number().int().min(0).max(CAP).nullable(),
  minutes: z.number().int().min(0).max(100000).nullable(),
  clean_sheets: z.number().int().min(0).max(CAP).nullable(),
}).partial()

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = CareerStatPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid career entry' }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await gate.supabase
    .from('career_stats')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already have an entry for that season and club' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update career entry' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Career entry not found' }, { status: 404 })

  return NextResponse.json({ careerStat: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  const { data, error } = await gate.supabase
    .from('career_stats')
    .delete()
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete career entry' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Career entry not found' }, { status: 404 })

  return NextResponse.json({ deleted: true })
}
