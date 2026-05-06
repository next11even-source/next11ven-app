import { createServerClient } from '@supabase/ssr'
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
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const now = new Date().toISOString()
  const { data: quota } = await supabase
    .from('player_message_quota')
    .select('messages_used, messages_limit, period_end')
    .eq('player_id', user.id)
    .lte('period_start', now)
    .gt('period_end', now)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!quota) return NextResponse.json({ messagesUsed: 0, messagesLimit: 3, periodEnd: null })

  return NextResponse.json({
    messagesUsed: quota.messages_used,
    messagesLimit: quota.messages_limit,
    periodEnd: quota.period_end,
  })
}
