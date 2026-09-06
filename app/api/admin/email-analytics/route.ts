import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// UUID v4 pattern — broadcast flows are stored as UUIDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10) || 30, 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all events in range — one row per event
  const { data: events, error } = await service
    .from('email_events')
    .select('resend_email_id, event_type, flow')
    .gte('occurred_at', since)

  if (error) {
    console.error('[email-analytics] query failed:', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  // Group: flow → event_type → Set of unique resend_email_ids
  const flowMap: Record<string, Record<string, Set<string>>> = {}

  for (const row of events ?? []) {
    const f = row.flow ?? '(untagged)'
    if (!flowMap[f]) flowMap[f] = {}
    const et = row.event_type
    if (!flowMap[f][et]) flowMap[f][et] = new Set()
    flowMap[f][et].add(row.resend_email_id)
  }

  // Flatten to counts
  const flowStats: Record<string, Record<string, number>> = {}
  for (const [f, etMap] of Object.entries(flowMap)) {
    flowStats[f] = {}
    for (const [et, ids] of Object.entries(etMap)) {
      flowStats[f][et] = ids.size
    }
  }

  // Fetch broadcast_logs for any UUID-shaped flows so we can include subjects
  const broadcastIds = Object.keys(flowStats).filter(f => UUID_RE.test(f))
  const broadcastMeta: Record<string, { subject: string; created_at: string }> = {}
  if (broadcastIds.length > 0) {
    const { data: logs } = await service
      .from('broadcast_logs')
      .select('id, subject, created_at')
      .in('id', broadcastIds)
    for (const log of logs ?? []) {
      broadcastMeta[log.id] = { subject: log.subject, created_at: log.created_at }
    }
  }

  return NextResponse.json({ flowStats, broadcastMeta, days, since })
}
