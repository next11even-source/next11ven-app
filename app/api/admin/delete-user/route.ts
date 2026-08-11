import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const DeleteUserSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
})

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = DeleteUserSchema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const { userId } = parsed.data

  // Prevent deleting your own account
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: target } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  // Never delete another admin from the UI — too easy to lock the platform out
  if (target?.role === 'admin') {
    return NextResponse.json({ error: 'Cannot delete an admin account' }, { status: 400 })
  }

  // Purge everything that points at this user. The legacy (Glide-era) tables were
  // created outside migrations and have no ON DELETE CASCADE, so their rows would
  // otherwise survive the profile delete with a dangling id. Best-effort: a table
  // that doesn't exist or doesn't have that column is logged, not fatal.
  async function purge(table: string, column: string, value: string) {
    const { error } = await admin.from(table).delete().eq(column, value)
    if (error) console.warn(`[Admin] delete-user purge ${table}.${column}:`, error.message)
  }

  // Messages first — they hang off conversations, not off the profile
  const { data: convs } = await admin
    .from('conversations')
    .select('id')
    .or(`coach_id.eq.${userId},player_id.eq.${userId}`)

  for (const c of convs ?? []) {
    await purge('messages', 'conversation_id', c.id)
  }
  await purge('messages', 'sender_id', userId)

  // Their posted roles, and any applications sitting on those roles
  const { data: opps } = await admin
    .from('opportunities')
    .select('id')
    .eq('coach_id', userId)

  for (const o of opps ?? []) {
    await purge('applications', 'opportunity_id', o.id)
  }

  const purges: [string, string][] = [
    ['conversations', 'coach_id'],
    ['conversations', 'player_id'],
    ['applications', 'player_id'],
    ['applications', 'coach_id'],
    ['opportunities', 'coach_id'],
    ['player_views', 'player_id'],
    ['player_views', 'viewer_id'],
    ['shortlist_alerts', 'player_id'],
    ['shortlist_alerts', 'coach_id'],
    ['coach_saved_players', 'player_id'],
    ['coach_saved_players', 'coach_id'],
    ['subscriptions', 'user_id'],
    ['player_message_quota', 'player_id'],
    ['drip_jobs', 'recipient_id'],
    ['notifications', 'recipient_id'],
  ]
  for (const [table, column] of purges) {
    await purge(table, column, userId)
  }

  // Delete profile row before the auth user so a blocked FK surfaces as an error
  // instead of leaving a profile behind with no auth account attached to it.
  const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId)
  if (profileErr) {
    console.error('[Admin] delete-user profile delete error:', profileErr)
    return NextResponse.json(
      { error: 'Failed to delete profile: ' + profileErr.message },
      { status: 500 }
    )
  }

  // Delete the auth user
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[Admin] delete-user error:', error)
    return NextResponse.json({ error: 'Failed to delete user: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId })
}
