import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { seasonStartYear } from '@/lib/performance'

const TargetSchema = z.object({
  season_start_year: z.number().int().min(2020).max(2100),
  apps_target: z.number().int().min(1).max(99).nullable().optional(),
  goals_target: z.number().int().min(0).max(199).nullable().optional(),
  assists_target: z.number().int().min(0).max(199).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const seasonParam = req.nextUrl.searchParams.get('season')
  const season = seasonParam && /^\d{4}$/.test(seasonParam)
    ? parseInt(seasonParam, 10)
    : seasonStartYear()

  const { data, error } = await gate.supabase
    .from('performance_targets')
    .select('*')
    .eq('player_id', gate.userId)
    .eq('season_start_year', season)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to load target' }, { status: 500 })

  return NextResponse.json({ target: data ?? null })
}

export async function PUT(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = TargetSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid target' }, { status: 400 })
  }

  const { data, error } = await gate.supabase
    .from('performance_targets')
    .upsert(
      { ...parsed.data, player_id: gate.userId, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,season_start_year' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to save target' }, { status: 500 })

  return NextResponse.json({ target: data })
}
