import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildPublicPerformance, type PublicMatch, type PublicCareerRow } from '@/lib/publicStats'
import { renderShareCard } from '@/lib/shareCard'
import { performanceTrackerEnabled } from '@/lib/performance'

export const runtime = 'nodejs'

// Branded 9:16 season card (1080×1920) the player can save and post to TikTok/IG.
// Renders the OWNER's own tracked stats — free, and never gated by the public
// visibility switch (sharing your own card is your call). Objective only.

export async function GET() {
  if (!performanceTrackerEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [{ data: profile }, { data: matchRows }, { data: careerRows }] = await Promise.all([
    supabase.from('profiles').select('full_name, position').eq('id', user.id).single(),
    supabase.from('performance_matches').select('*, club_stints(club_name, level)').eq('player_id', user.id).order('match_date', { ascending: false }),
    supabase.from('career_stats').select('*').eq('player_id', user.id),
  ])

  // Map owner rows into the allowlisted public shape (MOTM derived; no notes/tags/rating).
  const matches: PublicMatch[] = (matchRows ?? []).map((m: Record<string, unknown>) => ({
    match_date: m.match_date as string,
    competition_type: m.competition_type as string,
    goals_for: (m.goals_for as number | null) ?? null,
    goals_against: (m.goals_against as number | null) ?? null,
    started: m.started as boolean,
    position: (m.position as string | null) ?? null,
    minutes_played: (m.minutes_played as number | null) ?? null,
    goals: (m.goals as number) ?? 0,
    assists: (m.assists as number) ?? 0,
    penalty_saves: (m.penalty_saves as number) ?? 0,
    yellow_cards: (m.yellow_cards as number) ?? 0,
    red_card: (m.red_card as boolean) ?? false,
    club_name: (m.club_stints as { club_name?: string } | null)?.club_name ?? null,
    club_level: (m.club_stints as { level?: string } | null)?.level ?? null,
    man_of_the_match: Array.isArray(m.tags) && (m.tags as string[]).includes('man_of_the_match'),
  }))
  const career = (careerRows ?? []) as PublicCareerRow[]

  const perf = buildPublicPerformance({ visible: true, matches, career }, profile?.position ?? null)

  return renderShareCard(perf, { name: profile?.full_name ?? null, position: profile?.position ?? null })
}
