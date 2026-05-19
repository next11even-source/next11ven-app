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

  let body: { userId?: string; role?: string; full_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { userId, role, full_name: bodyName } = body
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

  // Resolve full_name: admin input → auth metadata → email prefix
  const resolvedName =
    (bodyName && bodyName.trim()) ||
    metaName ||
    (email ? email.split('@')[0] : 'Unknown')

  // Step 1: Write role + full_name into auth user_metadata.
  // The db trigger on profiles reads from raw_user_meta_data, so this ensures
  // the trigger picks up the correct role when it fires on the next write.
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...authUser.user_metadata,
      role,
      full_name: resolvedName,
    },
  })

  // Step 2: Upsert the profile. If a BEFORE trigger fires and reads from
  // auth metadata, it will now find role = 'coach'/'player'/'fan'.
  const { error: upsertError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      email,
      role,
      full_name: resolvedName,
      approved: false,
      approval_status: 'pending',
      status: 'just_exploring',
    }, { onConflict: 'id' })

  if (upsertError) {
    console.error('[Admin] rescue-profile upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to rescue profile: ' + upsertError.message }, { status: 500 })
  }

  // Step 3: Explicit UPDATE as belt-and-suspenders in case the trigger fires
  // on INSERT but not UPDATE.
  await admin
    .from('profiles')
    .update({ role, full_name: resolvedName, approved: false, approval_status: 'pending' })
    .eq('id', userId)

  // Step 4: Verify what actually ended up in the database.
  const { data: verified } = await admin
    .from('profiles')
    .select('id, role, full_name, email, approval_status, approved')
    .eq('id', userId)
    .single()

  if (!verified) {
    return NextResponse.json({ error: 'Profile write appeared to succeed but row not found on verify' }, { status: 500 })
  }

  // If the trigger is still overriding role, return an actionable error
  // rather than silently succeeding with wrong data.
  if (verified.role !== role) {
    return NextResponse.json({
      error: `A database trigger is overriding the role. DB has "${verified.role ?? 'null'}", expected "${role}". ` +
        `Check Supabase Dashboard → Database → Triggers for a trigger on the profiles table and share it.`,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profile: verified })
}
