import { NextRequest, NextResponse } from 'next/server'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import {
  isCompetitive,
  seasonLabel,
  seasonOfMatch,
  seasonStartYear,
  summariseMatches,
  involvements,
  type ClubStint,
  type PerformanceMatch,
} from '@/lib/performance'
import { generateInsight } from '@/lib/performanceInsights'

// One call powers the whole tracker dashboard: hero stat + trend, insight
// banner, season summary grid, friendlies line, recent matches, active stint,
// form defaults and target progress.
export async function GET(req: NextRequest) {
  const gate = await requireTrackerPlayer()
  if (!gate.ok) return gate.res

  const seasonParam = req.nextUrl.searchParams.get('season')
  const season = seasonParam && /^\d{4}$/.test(seasonParam)
    ? parseInt(seasonParam, 10)
    : seasonStartYear()

  const [matchesRes, stintsRes, targetRes] = await Promise.all([
    gate.supabase
      .from('performance_matches')
      .select('*')
      .eq('player_id', gate.userId)
      .order('match_date', { ascending: false })
      .order('created_at', { ascending: false }),
    gate.supabase
      .from('club_stints')
      .select('*')
      .eq('player_id', gate.userId)
      .order('start_date', { ascending: false }),
    gate.supabase
      .from('performance_targets')
      .select('*')
      .eq('player_id', gate.userId)
      .eq('season_start_year', season)
      .maybeSingle(),
  ])

  if (matchesRes.error || stintsRes.error) {
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }

  const all = (matchesRes.data ?? []) as PerformanceMatch[]
  const stints = (stintsRes.data ?? []) as ClubStint[]

  const seasonMatches = all.filter(m => seasonOfMatch(m.match_date) === season)
  const seasonCompetitive = seasonMatches.filter(m => isCompetitive(m.competition_type))
  const seasonFriendlies = seasonMatches.filter(m => !isCompetitive(m.competition_type))
  const careerCompetitive = all.filter(m => isCompetitive(m.competition_type))

  // Hero: goal involvements this season, trend = last 5 competitive games vs
  // the 5 before (needs a full comparison window, otherwise null).
  const last5 = seasonCompetitive.slice(0, 5)
  const prev5 = seasonCompetitive.slice(5, 10)
  let trend: 'up' | 'down' | 'flat' | null = null
  if (prev5.length === 5) {
    const recent = last5.reduce((n, m) => n + involvements(m), 0)
    const previous = prev5.reduce((n, m) => n + involvements(m), 0)
    trend = recent > previous ? 'up' : recent < previous ? 'down' : 'flat'
  }

  const insight = generateInsight({
    season: seasonCompetitive,
    career: careerCompetitive,
    stints,
    seasonLabel: seasonLabel(season),
  })

  const activeStint = stints.find(s => s.end_date === null) ?? null
  const lastMatch = all[0] ?? null
  const seasons = [...new Set(all.map(m => seasonOfMatch(m.match_date)))].sort((a, b) => b - a)

  return NextResponse.json({
    season,
    seasonLabel: seasonLabel(season),
    seasons,
    competitive: summariseMatches(seasonCompetitive),
    friendlies: summariseMatches(seasonFriendlies),
    trend,
    insight,
    recent: seasonMatches.slice(0, 10),
    activeStint,
    stints,
    target: targetRes.data ?? null,
    defaults: {
      position: lastMatch?.position ?? null,
      stint_id: lastMatch?.stint_id ?? null,
    },
  })
}
