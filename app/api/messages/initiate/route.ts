import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alert'
import { enforceRateLimit } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
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

  const limited = await enforceRateLimit('messagesInitiate', user.id)
  if (limited) return limited

  let body: { coachId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { coachId } = body
  if (!coachId) return NextResponse.json({ error: 'coachId is required' }, { status: 400 })

  const { data: sender } = await supabase
    .from('profiles')
    .select('role, premium')
    .eq('id', user.id)
    .single()

  if (!sender) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const isPlayer = sender.role === 'player' || sender.role === 'admin'
  if (!isPlayer) return NextResponse.json({ error: 'Players only' }, { status: 403 })
  if (!sender.premium) return NextResponse.json({ error: 'NOT_PREMIUM' }, { status: 403 })

  const { data: coach } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', coachId)
    .eq('role', 'coach')
    .single()

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Ensure a quota row exists for the current billing period (self-healing)
  const now = new Date().toISOString()
  const { data: existingQuota } = await admin
    .from('player_message_quota')
    .select('id')
    .eq('player_id', user.id)
    .lte('period_start', now)
    .gt('period_end', now)
    .limit(1)
    .maybeSingle()

  if (!existingQuota) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('current_period_start, current_period_end')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const periodStart = sub?.current_period_start ?? now
    const periodEnd = sub?.current_period_end ?? new Date(Date.now() + 30 * 86400000).toISOString()

    const { error: upsertErr } = await admin.from('player_message_quota').upsert({
      player_id: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      messages_used: 0,
      messages_limit: 3,
    }, { onConflict: 'player_id,period_start', ignoreDuplicates: true })

    if (upsertErr) {
      console.error('[Initiate] quota upsert error:', upsertErr)
      reportError('/api/messages/initiate', upsertErr, `player=${user.id} coach=${coachId}`)
      return NextResponse.json({ error: 'Failed to create message quota' }, { status: 500 })
    }
  }

  const { data: result, error: rpcError } = await admin.rpc('initiate_coach_conversation', {
    p_player_id: user.id,
    p_coach_id: coachId,
  })

  if (rpcError) {
    if (rpcError.message.includes('QUOTA_EXHAUSTED')) {
      return NextResponse.json({ error: 'QUOTA_EXHAUSTED' }, { status: 403 })
    }
    if (rpcError.message.includes('QUOTA_NOT_FOUND')) {
      return NextResponse.json({ error: 'QUOTA_NOT_FOUND' }, { status: 500 })
    }
    if (rpcError.message.includes('COOLDOWN_ACTIVE')) {
      const cooldownUntil = rpcError.message.split('COOLDOWN_ACTIVE:')[1]?.trim() ?? null
      return NextResponse.json({ error: 'COOLDOWN_ACTIVE', cooldownUntil }, { status: 403 })
    }
    console.error('[Initiate] rpc error:', rpcError)
    reportError('/api/messages/initiate', rpcError, `player=${user.id} coach=${coachId}`)
    return NextResponse.json({ error: 'Failed to initiate conversation' }, { status: 500 })
  }

  const r = result as {
    conversationId: string
    messagesUsed: number
    messagesLimit: number
    usedPurchased: boolean
    existing: boolean
  }

  return NextResponse.json({
    conversationId: r.conversationId,
    messagesUsed: r.messagesUsed,
    messagesLimit: r.messagesLimit,
    usedPurchased: r.usedPurchased ?? false,
  })
}
