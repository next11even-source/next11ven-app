import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all auth users
  const { data: { users: authUsers }, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authError) {
    console.error('[Admin] orphaned-users auth list error:', authError)
    return NextResponse.json({ error: 'Failed to fetch auth users' }, { status: 500 })
  }

  // Fetch all profiles (including incomplete ones)
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, full_name, email, role, approval_status, approved')

  if (profilesError) {
    console.error('[Admin] orphaned-users profiles error:', profilesError)
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
  }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  // Find orphaned: no profile at all, or profile with null role (incomplete signup)
  const orphaned = authUsers
    .filter(u => {
      if (u.email === process.env.ADMIN_EMAIL) return false // skip your own account
      const profile = profileMap.get(u.id)
      if (!profile) return true  // no profile row at all
      if (!profile.role) return true  // profile exists but role not set (upsert failed)
      return false
    })
    .map(u => {
      const profile = profileMap.get(u.id)
      // Try to get name from user_metadata (set during signUp options.data)
      const metaName = (u.user_metadata?.full_name as string | undefined) ?? null
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        full_name: profile?.full_name ?? metaName,
        has_profile: !!profile,
        current_approval_status: profile?.approval_status ?? null,
      }
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ orphaned })
}
