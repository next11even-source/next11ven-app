import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getOpportunityMatchPercent, isCloseMatch, type RelevancePlayerProfile } from '@/lib/opportunityRelevance'
import { stepNumber } from '@/lib/levels'

// Player-facing opportunities feed. Everything the Open Roles list needs in one
// gated payload. Two things are enforced HERE, server-side, and must never move
// to the client:
//   1. `club` is nulled out for non-premium players (premium-only detail).
//   2. `matchPercent` is computed ONLY for premium players — the raw score is
//      absent from the free-tier payload, so it can't be read off the network
//      tab. Free players get matchPercent: null and render the locked chip.
// Non-sensitive derived fields (inRange, isCloseMatch, matchRankHint) are safe
// to send to everyone — they only affect ordering/tinting, not the headline %.

type FeedOpportunity = {
  id: string
  coach_id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  description: string | null
  urgent: boolean
  deadline: string | null
  created_at: string
  application_count: number
  inRange: boolean
  isCloseMatch: boolean
  matchPercent: number | null
}

export async function GET(req: NextRequest) {
  // Optional ?limit= — the homepage preview asks for a small slice; the full
  // Open Roles feed omits it and takes the bounded default.
  const limitParam = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 200

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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Viewing player's profile — premium flag gates club + match %, the rest feeds
  // the relevance scoring.
  const { data: profile } = await admin
    .from('profiles')
    .select('position, secondary_position, playing_level, city, location, premium')
    .eq('id', user.id)
    .single()

  const isPremium = profile?.premium === true
  const playerProfile: RelevancePlayerProfile | null = profile
    ? {
        position: profile.position,
        secondary_position: profile.secondary_position,
        playing_level: profile.playing_level,
        city: profile.city,
        location: profile.location,
      }
    : null

  // TODO(pagination): this fetches all active opportunities in one bounded shot
  // (capped at 200) so the client can filter + rank the full set locally. Once
  // the active-opps count approaches that cap, move to server-side pagination
  // here (and push search/filter/ranking server-side) to protect egress — same
  // treatment already applied to the player/coach browse pages.
  const { data: oppRows } = await admin
    .from('opportunities')
    .select('id, coach_id, title, club, location, position, level, description, urgent, deadline, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  const opps = oppRows ?? []
  const oppIds = opps.map(o => o.id)

  // One applications query serves both the per-role counts and this player's
  // already-applied set.
  const applied = new Set<string>()
  const counts: Record<string, number> = {}
  for (const id of oppIds) counts[id] = 0
  if (oppIds.length) {
    const { data: apps } = await admin
      .from('applications')
      .select('opportunity_id, player_id')
      .in('opportunity_id', oppIds)
    for (const a of apps ?? []) {
      counts[a.opportunity_id] = (counts[a.opportunity_id] ?? 0) + 1
      if (a.player_id === user.id) applied.add(a.opportunity_id)
    }
  }

  const playerStep = stepNumber(profile?.playing_level)

  let matchedCount = 0
  const opportunities: FeedOpportunity[] = opps.map(o => {
    const oppStep = stepNumber(o.level)
    const inRange = playerStep !== null && oppStep !== null && Math.abs(playerStep - oppStep) <= 1
    const close = playerProfile ? isCloseMatch(o, playerProfile) : false
    if (close) matchedCount++
    return {
      id: o.id,
      coach_id: o.coach_id,
      title: o.title,
      // Premium-only detail — nulled here so the club name never reaches a
      // free client, not merely hidden in the UI.
      club: isPremium ? o.club : null,
      location: o.location,
      position: o.position,
      level: o.level,
      description: o.description,
      urgent: o.urgent ?? false,
      deadline: o.deadline,
      created_at: o.created_at,
      application_count: counts[o.id] ?? 0,
      inRange,
      isCloseMatch: close,
      // Premium-only headline figure — absent from the free payload.
      matchPercent: isPremium && playerProfile ? getOpportunityMatchPercent(o, playerProfile) : null,
    }
  })

  return NextResponse.json({
    premium: isPremium,
    hasMatchSignal: !!(profile?.position && profile?.playing_level),
    matchedCount,
    opportunities,
    appliedIds: Array.from(applied),
  })
}
