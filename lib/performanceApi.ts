// Game Performance Tracker — shared API route guard (server-side only)
//
// Every tracker route runs the same gate, in order:
//   1. Kill switch — 404 when the feature is globally off (looks like it doesn't exist)
//   2. Auth — 401
//   3. Player role (admin counts as player, house rule) — 403
//   4. Writes only: premium — 403 NOT_PREMIUM (skipped in free-launch mode)
//
// Reads are never premium-gated: a player can ALWAYS see and export what they
// logged (the endowment that drives the upgrade after the premium flip) — only
// adding/editing is paid. RLS is the privacy backstop underneath all of this.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { performanceTrackerEnabled, performanceTrackerFree } from './performance'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
}

type Supabase = Awaited<ReturnType<typeof getSupabase>>

export type TrackerGate =
  | { ok: true; supabase: Supabase; userId: string; premium: boolean; position: string | null; canWrite: boolean }
  | { ok: false; res: NextResponse }

export async function requireTrackerPlayer(opts?: { write?: boolean }): Promise<TrackerGate> {
  if (!performanceTrackerEnabled()) {
    return { ok: false, res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, premium, position')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { ok: false, res: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  }

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer) {
    return { ok: false, res: NextResponse.json({ error: 'Players only' }, { status: 403 }) }
  }

  const canWrite = !!profile.premium || performanceTrackerFree()

  if (opts?.write && !canWrite) {
    return { ok: false, res: NextResponse.json({ error: 'NOT_PREMIUM' }, { status: 403 }) }
  }

  return { ok: true, supabase, userId: user.id, premium: !!profile.premium, position: profile.position ?? null, canWrite }
}
