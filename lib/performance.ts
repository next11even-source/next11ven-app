// Game Performance Tracker — shared domain module (isomorphic: safe on client + server)
//
// Season runs 1 July → 30 June. Competitive = league + cup: only those feed
// season totals, the hero stat and insights. Pre-season/friendlies/other are
// logged and filterable but sit outside the headline numbers.

import { positionCategory, type PositionCategory } from './positions'

// ── Kill switch ───────────────────────────────────────────────────────────────
// Global flag, separate from premium gating: controls whether the tracker is
// visible to ANYONE. Default off — code ships dark until explicitly enabled.
// NEXT_PUBLIC_ so nav entries can hide client-side; API routes 404 when off.
export function performanceTrackerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PERFORMANCE_TRACKER_ENABLED === 'true'
}

// Free-launch mode: when on, the tracker skips the premium gate (client locked
// state + server 403) so usage data can build before it becomes a paid
// feature. Default off = premium-gated as designed. Flip without code changes.
export function performanceTrackerFree(): boolean {
  return process.env.NEXT_PUBLIC_PERFORMANCE_TRACKER_FREE === 'true'
}

// ── Competition types ─────────────────────────────────────────────────────────
export const COMPETITION_TYPES = ['league', 'cup', 'pre_season', 'friendly', 'other'] as const
export type CompetitionType = typeof COMPETITION_TYPES[number]

export const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  league: 'League',
  cup: 'Cup',
  pre_season: 'Pre-season',
  friendly: 'Friendly',
  other: 'Other',
}

/** Only these count toward season totals, the hero stat and insights. */
export const COMPETITIVE_TYPES: CompetitionType[] = ['league', 'cup']

export function isCompetitive(type: string): boolean {
  return COMPETITIVE_TYPES.includes(type as CompetitionType)
}

// ── Pre-season inclusion toggle ───────────────────────────────────────────────
// Player-level preference (profiles.performance_include_preseason): null means
// they haven't chosen — auto-resolves to on the moment they've logged a
// non-competitive match, so pre-season players get useful stats immediately
// instead of waiting for a league game. Once they explicitly set true/false
// (the toggle in the UI), that choice is pinned regardless of future matches.
export function effectiveIncludePreseason(pref: boolean | null, hasPreseasonMatches: boolean): boolean {
  return pref === null ? hasPreseasonMatches : pref
}

// ── Stints ────────────────────────────────────────────────────────────────────
export const STINT_TYPES = ['contracted', 'trial', 'loan'] as const
export type StintType = typeof STINT_TYPES[number]

export const STINT_TYPE_LABELS: Record<StintType, string> = {
  contracted: 'Contracted',
  trial: 'Trial',
  loan: 'Loan',
}

// ── Tags ──────────────────────────────────────────────────────────────────────
export const MATCH_TAGS = [
  'man_of_the_match',
  'return_from_injury',
  'first_start',
  'new_position',
  'trialist',
  'captain',
] as const
export type MatchTag = typeof MATCH_TAGS[number]

export const MATCH_TAG_LABELS: Record<MatchTag, string> = {
  man_of_the_match: 'Man of the match',
  return_from_injury: 'Return from injury',
  first_start: 'First start',
  new_position: 'New position',
  trialist: 'Trialist',
  captain: 'Captain',
}

// ── Row types (match the migration) ───────────────────────────────────────────
export type ClubStint = {
  id: string
  player_id: string
  club_name: string
  level: string | null
  stint_type: StintType
  start_date: string
  end_date: string | null
  created_at: string
  updated_at: string
}

export type PerformanceMatch = {
  id: string
  player_id: string
  stint_id: string | null
  match_date: string
  opponent: string
  competition_type: CompetitionType
  competition_name: string | null
  goals_for: number | null
  goals_against: number | null
  started: boolean
  position: string | null
  minutes_played: number | null
  goals: number
  assists: number
  penalty_saves: number
  rating: number | null
  notes: string | null
  tags: string[]
  visible_on_profile: boolean
  created_at: string
  updated_at: string
}

// ── Season helpers (1 July – 30 June) ─────────────────────────────────────────
/** Season start year for a date: July onwards = that year, else previous. */
export function seasonStartYear(date: Date = new Date()): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

/** e.g. 2026 → "2026/27" */
export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** Inclusive date-string bounds for a season. */
export function seasonRange(startYear: number): { from: string; to: string } {
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30` }
}

export function seasonOfMatch(matchDate: string): number {
  return seasonStartYear(new Date(`${matchDate}T00:00:00Z`))
}

// ── Aggregation ───────────────────────────────────────────────────────────────
export type MatchSummary = {
  apps: number
  starts: number
  goals: number
  assists: number
  involvements: number
  minutes: number
  avgMinutes: number | null  // over matches with minutes recorded, whole number
  minutesApps: number        // matches with minutes recorded
  avgRating: number | null   // over rated matches only, 1dp
  ratedCount: number
  cleanSheets: number        // score recorded and 0 conceded
  scoredApps: number         // matches with a score recorded (clean-sheet denominator)
  penaltySaves: number
  motmCount: number          // matches tagged man_of_the_match
  won: number
  drawn: number
  lost: number
}

// The structural subset summariseMatches actually reads. PerformanceMatch
// satisfies it; so does the allowlisted public payload (lib/publicStats.ts),
// which lets the public profile reuse the exact same aggregation.
export type AggregatableMatch = {
  started: boolean
  goals: number
  assists: number
  penalty_saves: number | null
  tags?: string[] | null
  minutes_played: number | null
  rating: number | null
  goals_for: number | null
  goals_against: number | null
}

export function summariseMatches(matches: AggregatableMatch[]): MatchSummary {
  const s: MatchSummary = {
    apps: matches.length, starts: 0, goals: 0, assists: 0, involvements: 0,
    minutes: 0, avgMinutes: null, minutesApps: 0, avgRating: null, ratedCount: 0,
    cleanSheets: 0, scoredApps: 0, penaltySaves: 0, motmCount: 0, won: 0, drawn: 0, lost: 0,
  }
  let ratingSum = 0
  for (const m of matches) {
    if (m.started) s.starts++
    s.goals += m.goals
    s.assists += m.assists
    s.penaltySaves += m.penalty_saves ?? 0
    if (m.tags?.includes('man_of_the_match')) s.motmCount++
    if (m.minutes_played != null) { s.minutes += m.minutes_played; s.minutesApps++ }
    if (m.rating != null) { ratingSum += Number(m.rating); s.ratedCount++ }
    if (m.goals_for != null && m.goals_against != null) {
      s.scoredApps++
      if (m.goals_against === 0) s.cleanSheets++
      if (m.goals_for > m.goals_against) s.won++
      else if (m.goals_for === m.goals_against) s.drawn++
      else s.lost++
    }
  }
  s.involvements = s.goals + s.assists
  s.avgMinutes = s.minutesApps ? Math.round(s.minutes / s.minutesApps) : null
  s.avgRating = s.ratedCount ? Math.round((ratingSum / s.ratedCount) * 10) / 10 : null
  return s
}

export function involvements(m: PerformanceMatch): number {
  return m.goals + m.assists
}

export function isCleanSheet(m: PerformanceMatch): boolean {
  return m.goals_for != null && m.goals_against === 0
}

// ── Position-aware layout ─────────────────────────────────────────────────────
// Goalkeepers and defenders lead with clean sheets; midfielders and attackers
// lead with goal involvements. Category comes from the profile position, falling
// back to the most-logged match position so the tracker adapts even when the
// profile is thin.
export type TrackerFocus = 'defensive' | 'attacking'

export function trackerFocus(category: PositionCategory | null): TrackerFocus {
  return category === 'goalkeepers' || category === 'defenders' ? 'defensive' : 'attacking'
}

export function dominantCategory(
  profilePosition: string | null | undefined,
  matches: { position: string | null }[],
): PositionCategory | null {
  const fromProfile = positionCategory(profilePosition)
  if (fromProfile) return fromProfile
  const counts = new Map<PositionCategory, number>()
  for (const m of matches) {
    const c = positionCategory(m.position)
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  let best: PositionCategory | null = null
  let bestCount = 0
  for (const [c, n] of counts) {
    if (n > bestCount) { best = c; bestCount = n }
  }
  return best
}
