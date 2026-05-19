import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

  let body: { userId?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { userId, role } = body
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const allowedRoles = ['player', 'coach', 'fan']
  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'role must be player, coach, or fan' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify this is a real auth user and fetch their metadata
  const { data: { user: authUser }, error: authError } = await admin.auth.admin.getUserById(userId)
  if (authError || !authUser) {
    return NextResponse.json({ error: 'Auth user not found' }, { status: 404 })
  }

  const email = authUser.email ?? null
  const metaName = (authUser.user_metadata?.full_name as string | undefined) ?? null

  // Check if a profile already exists
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .single()

  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    role,
    approved: false,
    approval_status: 'pending',
  }

  // Only set full_name if we have it and it's not already set on the profile
  if (!existingProfile?.full_name && metaName) {
    profilePayload.full_name = metaName
  }

  const { error: upsertError } = await admin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })

  if (upsertError) {
    console.error('[Admin] rescue-profile upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to rescue profile: ' + upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId, role, email, full_name: profilePayload.full_name ?? existingProfile?.full_name ?? null })
}
