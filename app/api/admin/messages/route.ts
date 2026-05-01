import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const PAGE_SIZE = 20

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

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '0', 10)
  const offset = page * PAGE_SIZE

  const { data: msgs, count, error } = await admin
    .from('messages')
    .select('id, content, created_at, sender_id, conversation_id, conversations(coach_id, player_id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ messages: [], total: count ?? 0 })
  }

  type ConvRow = { coach_id: string; player_id: string }

  const userIds = [...new Set(msgs.flatMap(m => {
    const raw = m.conversations
    const conv = (Array.isArray(raw) ? raw[0] : raw) as ConvRow | null | undefined
    if (!conv) return [m.sender_id]
    return [m.sender_id, conv.coach_id, conv.player_id]
  }))]

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, club, role')
    .in('id', userIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const messages = msgs.map(m => {
    const raw = m.conversations
    const conv = (Array.isArray(raw) ? raw[0] : raw) as ConvRow | null | undefined
    const sender = profileMap[m.sender_id] as { full_name: string | null; club: string | null; role: string | null } | undefined
    const otherId = conv ? (conv.coach_id === m.sender_id ? conv.player_id : conv.coach_id) : null
    const other = otherId ? profileMap[otherId] as { full_name: string | null; club: string | null; role: string | null } | undefined : undefined
    return {
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      sender_name: sender?.full_name ?? null,
      sender_club: sender?.club ?? null,
      sender_role: sender?.role ?? null,
      other_name: other?.full_name ?? null,
      other_club: other?.club ?? null,
      other_role: other?.role ?? null,
    }
  })

  messages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ messages, total: count ?? 0 })
}
