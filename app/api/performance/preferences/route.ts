import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { isCompetitive, effectiveIncludePreseason } from '@/lib/performance'

const PrefSchema = z.object({ include_preseason: z.boolean() })

export async function GET() {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const { data, error } = await gate.supabase
    .from('performance_matches')
    .select('competition_type')
    .eq('player_id', gate.userId)

  if (error) return NextResponse.json({ error: 'Failed to load preference' }, { status: 500 })

  const preseasonLogged = (data ?? []).some(m => !isCompetitive(m.competition_type))
  const includePreseason = effectiveIncludePreseason(gate.includePreseasonPref, preseasonLogged)

  return NextResponse.json({ includePreseason, preseasonLogged })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = PrefSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid preference' }, { status: 400 })
  }

  const { error } = await gate.supabase
    .from('profiles')
    .update({ performance_include_preseason: parsed.data.include_preseason })
    .eq('id', gate.userId)

  if (error) return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })

  return NextResponse.json({ includePreseason: parsed.data.include_preseason })
}
