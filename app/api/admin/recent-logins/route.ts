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

  // Fetch all auth users (paginated at 1000 by default — fine for this platform size)
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort by last_sign_in_at desc, take top 10
  const recent = [...users]
    .filter(u => u.last_sign_in_at)
    .sort((a, b) => new Date(b.last_sign_in_at!).getTime() - new Date(a.last_sign_in_at!).getTime())
    .slice(0, 10)

  if (recent.length === 0) return NextResponse.json({ logins: [] })

  const ids = recent.map(u => u.id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, club')
    .in('id', ids)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const logins = recent.map(u => ({
    id: u.id,
    email: u.email ?? null,
    last_sign_in_at: u.last_sign_in_at!,
    full_name: profileMap[u.id]?.full_name ?? null,
    role: profileMap[u.id]?.role ?? null,
    club: profileMap[u.id]?.club ?? null,
  }))

  return NextResponse.json({ logins })
}
