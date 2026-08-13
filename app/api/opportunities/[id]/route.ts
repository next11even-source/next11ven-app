import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { reportError } from '@/lib/alert'
import { closeApplicationsForOpportunity } from '@/lib/opportunityClosure'
import { z } from 'zod'

// Coach-owned toggle for their own opportunity — replaces the previous direct
// client-side write. Needs a server route (not a client supabase call)
// because closing a role now cascades onto its applications and notifications
// tables, and clients can't write notifications (service-role/trigger only).
//
// Closing (is_active: false) mirrors what /api/cron/opportunity-close does
// for an auto-close: immediately resolves the role's own open applications
// via lib/opportunityClosure.ts rather than leaving them to age out on
// application-close's separate 21-day sweep. auto_closed_at/auto_close_reason
// are left null here — this is a coach's own decision, not a platform one.
//
// Reopening (is_active: true) clears auto_closed_at/auto_close_reason, so a
// role a coach brings back manually stops reading as "auto-closed".

const ToggleSchema = z.object({
  is_active: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = ToggleSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
  }
  const { is_active } = parsed.data

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: opp, error: oppErr } = await admin
    .from('opportunities')
    .select('id, coach_id')
    .eq('id', id)
    .single()

  if (oppErr || !opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  const { data: caller } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (opp.coach_id !== user.id && caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Not your opportunity' }, { status: 403 })
  }

  const patch = is_active
    ? { is_active: true, auto_closed_at: null, auto_close_reason: null }
    : { is_active: false }

  // Guarded on the CURRENT state, same idiom as opportunity-close's own
  // "don't overwrite a concurrent close" — a double-tap or a retried request
  // only affects this row on the call that actually finds it in the state
  // being transitioned FROM. Not what makes the cascade below safe (that
  // guard lives in lib/opportunityClosure.ts, on the applications write
  // itself) — this is the outer layer's own belt-and-suspenders, and it
  // means a redundant call skips the cascade entirely rather than relying on
  // the inner guard to no-op it.
  const { data: updated, error: updateErr } = await admin
    .from('opportunities')
    .update(patch)
    .eq('id', id)
    .eq('is_active', !is_active)
    .select('id')

  if (updateErr) {
    reportError('/api/opportunities/[id]', updateErr, `toggle failed for opportunity ${id}`)
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
  }

  const changed = (updated ?? []).length > 0

  let applicationsClosed = 0
  // Only cascade on a transition THIS call actually made — a redundant close
  // (already closed, nothing to transition) skips it outright. The inner
  // guard in lib/opportunityClosure.ts would no-op it anyway, but there's no
  // reason to pay for the read when the outer state already says nothing changed.
  if (!is_active && changed) {
    try {
      const result = await closeApplicationsForOpportunity(admin, id)
      applicationsClosed = result.closed
    } catch (err) {
      reportError('/api/opportunities/[id]', err, `application cascade failed for opportunity ${id}`)
    }
  }

  return NextResponse.json({ ...patch, changed, applicationsClosed })
}
