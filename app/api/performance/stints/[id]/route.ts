import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import { STINT_TYPES } from '@/lib/performance'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const StintPatchSchema = z.object({
  club_name: z.string().trim().min(1).max(60),
  level: z.string().trim().max(30).nullable(),
  stint_type: z.enum(STINT_TYPES),
  start_date: z.string().regex(DATE, 'Invalid date'),
  end_date: z.string().regex(DATE, 'Invalid date').nullable(),
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

  const parsed = StintPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid stint' }, { status: 400 })
  }
  const body = parsed.data
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // The DB check constraint enforces end >= start; pre-check the combined
  // result so the client gets a clear message instead of a 500.
  if (body.start_date || body.end_date !== undefined) {
    const { data: existing } = await gate.supabase
      .from('club_stints')
      .select('start_date, end_date')
      .eq('id', id)
      .eq('player_id', gate.userId)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Stint not found' }, { status: 404 })
    const start = body.start_date ?? existing.start_date
    const end = body.end_date !== undefined ? body.end_date : existing.end_date
    if (end && end < start) {
      return NextResponse.json({ error: 'End date is before start date' }, { status: 400 })
    }
  }

  const { data, error } = await gate.supabase
    .from('club_stints')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to update stint' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Stint not found' }, { status: 404 })

  return NextResponse.json({ stint: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res
  const { id } = await params

  // Matches under this stint survive — FK is ON DELETE SET NULL, so the
  // history stays and just becomes unattached.
  const { data, error } = await gate.supabase
    .from('club_stints')
    .delete()
    .eq('id', id)
    .eq('player_id', gate.userId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete stint' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Stint not found' }, { status: 404 })

  return NextResponse.json({ deleted: true })
}
