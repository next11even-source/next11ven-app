import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { sendApplicationDecisionEmail } from '@/lib/email'

const VALID_STATUSES = ['accepted', 'rejected', 'shortlisted', 'viewed', 'pending']

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

  const body = await request.json()
  const { status, message } = body as { status: string; message?: string }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Fetch application and verify this coach owns it
  const { data: app, error: fetchErr } = await supabase
    .from('applications')
    .select(`
      id, status,
      opportunity:opportunity_id ( title, coach_id ),
      player:player_id ( email, full_name )
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const opp = app.opportunity as unknown as { title: string; coach_id: string } | null
  if (opp?.coach_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Update status
  const { error: updateErr } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Email player on accepted/rejected decisions
  if (status === 'accepted' || status === 'rejected') {
    const player = app.player as unknown as { email: string; full_name: string | null } | null
    if (player?.email) {
      await sendApplicationDecisionEmail({
        to: player.email,
        playerName: player.full_name,
        opportunityTitle: opp?.title ?? 'the role',
        status,
        message: message ?? null,
      })
    }
  }

  return NextResponse.json({ success: true, status })
}
