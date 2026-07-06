import { NextRequest, NextResponse } from 'next/server'
import { requireTrackerPlayer } from '@/lib/performanceApi'
import {
  isCompetitive,
  isCleanSheet,
  seasonLabel,
  seasonOfMatch,
  seasonStartYear,
  summariseMatches,
  involvements,
  dominantCategory,
  trackerFocus,
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

  // Position-aware layout: GK/DEF lead with clean sheets, MID/ATT with goal
  // involvements. Category from profile position, falling back to the
  // most-logged match position.
  const category = dominantCategory(gate.position, all)
  const focus = trackerFocus(category)

  // Hero trend = last 5 competitive games vs the 5 before (needs a full
  // comparison window, otherwise null). Metric follows the focus.
  const heroMetric = (m: PerformanceMatch) =>
    focus === 'defensive' ? (isCleanSheet(m) ? 1 : 0) : involvements(m)
  const last5 = seasonCompetitive.slice(0, 5)
  const prev5 = seasonCompetitive.slice(5, 10)
  let trend: 'up' | 'down' | 'flat' | null = null
  if (prev5.length === 5) {
    const recent = last5.reduce((n, m) => n + heroMetric(m), 0)
    const previous = prev5.reduce((n, m) => n + heroMetric(m), 0)
    trend = recent > previous ? 'up' : recent < previous ? 'down' : 'flat'
  }

  // Read-only players (post-premium-flip) never receive insight text — it's a
  // locked teaser client-side, and the real content stays server-side.
  const insight = gate.canWrite
    ? generateInsight({
        season: seasonCompetitive,
        career: careerCompetitive,
        stints,
        seasonLabel: seasonLabel(season),
        focus,
      })
    : null

  const activeStint = stints.find(s => s.end_date === null) ?? null
  const lastMatch = all[0] ?? null
  const seasons = [...new Set(all.map(m => seasonOfMatch(m.match_date)))].sort((a, b) => b - a)

  return NextResponse.json({
    season,
    seasonLabel: seasonLabel(season),
    seasons,
    access: gate.canWrite ? 'full' : 'readonly',
    category,
    focus,
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
