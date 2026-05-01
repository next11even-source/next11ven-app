import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
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

  const since = req.nextUrl.searchParams.get('since')

  let msgsQ = admin.from('messages').select('created_at', { count: 'exact' }).limit(1000)
  let convsQ = admin.from('conversations').select('created_at', { count: 'exact' })

  if (since) {
    msgsQ = msgsQ.gte('created_at', since)
    convsQ = convsQ.gte('created_at', since)
  }

  const [msgsRes, convsRes] = await Promise.all([msgsQ, convsQ])

  const timestamps = (msgsRes.data ?? []).map((r: { created_at: string }) => r.created_at)

  return NextResponse.json({
    messagesSent: msgsRes.count ?? 0,
    newConversations: convsRes.count ?? 0,
    messageTimestamps: timestamps,
  })
}
