import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { STINT_TYPES } from '@/lib/performance'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const StintSchema = z.object({
  club_name: z.string().trim().min(1).max(60),
  level: z.string().trim().max(30).nullable().optional(),
  stint_type: z.enum(STINT_TYPES).default('contracted'),
  start_date: z.string().regex(DATE, 'Invalid date'),
  end_date: z.string().regex(DATE, 'Invalid date').nullable().optional(),
  // Close any other ongoing non-trial stints when this one starts (the
  // lightweight "moved club" flow — trials can overlap a contracted stint).
  close_others: z.boolean().default(false),
}).refine(
  s => !s.end_date || s.end_date >= s.start_date,
  { message: 'End date is before start date' }
)

export async function GET() {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const { data, error } = await gate.supabase
    .from('club_stints')
    .select('*')
    .eq('player_id', gate.userId)
    .order('start_date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load stints' }, { status: 500 })

  return NextResponse.json({ stints: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = StintSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid stint' }, { status: 400 })
  }
  const { close_others, ...stint } = parsed.data

  if (close_others) {
    await gate.supabase
      .from('club_stints')
      .update({ end_date: stint.start_date, updated_at: new Date().toISOString() })
      .eq('player_id', gate.userId)
      .is('end_date', null)
      .neq('stint_type', 'trial')
  }

  const { data, error } = await gate.supabase
    .from('club_stints')
    .insert({ ...stint, player_id: gate.userId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create stint' }, { status: 500 })

  return NextResponse.json({ stint: data }, { status: 201 })
}
