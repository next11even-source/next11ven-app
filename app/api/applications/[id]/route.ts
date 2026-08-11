import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { sendApplicationDecisionEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'
import { z } from 'zod'

const DecisionSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'shortlisted', 'viewed', 'pending']),
  message: z.string().max(2000).optional(),
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

  const parsed = DecisionSchema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const { status, message } = parsed.data

  // Fetch application and verify this coach owns it
  const { data: app, error: fetchErr } = await supabase
    .from('applications')
    .select(`
      id, status, player_id, opportunity_id,
      opportunity:opportunity_id ( title, club, coach_id ),
      player:player_id ( email, full_name )
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const opp = app.opportunity as unknown as { title: string; club: string | null; coach_id: string } | null
  if (opp?.coach_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Update status
  const { error: updateErr } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', id)

  if (updateErr) {
    reportError('/api/applications/[id]', updateErr, `application_id: ${id}, status: ${status}`)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ─── Notify the player ──────────────────────────────────────────────────────
  //
  // Accepts and declines are deliberately NOT symmetrical.
  //
  // An accept is the best thing that happens to a player here. It always emails
  // and always lands as its own in-app row — never batched, never suppressed.
  //
  // A decline is bad news, and the nudge cron now pushes coaches to clear whole
  // backlogs in one sitting. Unthrottled that meant a player who applied to four
  // of a club's roles got four emails and four rows in a row. So: in-app always
  // (they're entitled to know), but the EMAIL is capped at one per player per
  // 24h — same pattern as shortlist_availability in /api/player/status-change.
  // In-app declines then collapse into a single daily row on the activity page.
  if (status === 'accepted' || status === 'rejected') {
    const player = app.player as unknown as { email: string; full_name: string | null } | null
    const accepted = status === 'accepted'
    const role = [opp?.title, opp?.club].filter(Boolean).join(' at ') || 'a role'

    // Service-role client: RLS allows no client inserts on notifications.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let shouldEmail = true
    if (!accepted) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recentDeclines } = await admin
        .from('notifications')
        .select('id')
        .eq('recipient_id', app.player_id)
        .eq('type', 'application_declined')
        .gte('created_at', dayAgo)
        .limit(1)
      // Already told them today. One "no" a day is enough — the rest are
      // waiting in the app whenever they're ready to look.
      if (recentDeclines && recentDeclines.length > 0) shouldEmail = false
    }

    if (player?.email && shouldEmail) {
      await sendApplicationDecisionEmail({
        to: player.email,
        playerName: player.full_name,
        opportunityTitle: opp?.title ?? 'the role',
        status,
        message: message ?? null,
      })
    }

    // Best-effort: a decision must never fail because a notification did.
    try {
      await admin.from('notifications').insert({
        recipient_id: app.player_id,
        // Declines carry no actor. A grouped row reading "3 applications
        // weren't taken forward" should not be fronted by one coach's face,
        // and a single decline doesn't need a portrait of who said no.
        actor_id: accepted ? user.id : null,
        type: accepted ? 'application_decision' : 'application_declined',
        entity_type: 'opportunity',
        entity_id: app.opportunity_id,
        message: accepted
          ? `Your application for ${role} was accepted. Check your messages.`
          : `Your application for ${role} wasn't taken forward this time.`,
      })
    } catch (err) {
      reportError('/api/applications/[id]', err, `decision notification failed for application ${id}`)
    }
  }

  return NextResponse.json({ success: true, status })
}
