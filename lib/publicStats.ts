// Public profile performance — turns the allowlisted payload from the
// public_player_performance() RPC into a rendered aggregate. Pure and
// isomorphic so it's unit-testable (lib/publicStats.test.ts).
//
// The one invariant with no DB constraint behind it: a season is EITHER
// log-sourced OR career-sourced, never both. If the live log has any match in a
// season, that season's career_stats rows are dropped (the player has been
// logging it for real; the pre-platform summary is superseded). This function
// is the sole enforcement point — see the tests for the overlap cases.

import {
  summariseMatches,
  seasonOfMatch,
  seasonLabel,
  seasonStartYear,
  isCompetitive,
  dominantCategory,
  trackerFocus,
  type MatchSummary,
  type AggregatableMatch,
} from './performance'

// ── Shapes returned by the RPC (objective only — no notes/tags/rating) ────────
export type PublicMatch = {
  match_date: string
  competition_type: string
  goals_for: number | null
  goals_against: number | null
  started: boolean
  position: string | null
  minutes_played: number | null
  goals: number
  assists: number
  penalty_saves: number
  yellow_cards: number
  red_card: boolean
  club_name: string | null
  club_level: string | null
  man_of_the_match: boolean
}

export type PublicCareerRow = {
  season_start_year: number
  club_name: string | null
  level: string | null
  position: string | null
  apps: number | null
  goals: number | null
  assists: number | null
  minutes: number | null
  clean_sheets: number | null
  source: 'self_reported' | 'legacy_import'
}

export type PublicPerformancePayload = {
  visible: boolean
  matches?: PublicMatch[]
  career?: PublicCareerRow[]
}

// ── Rendered output ───────────────────────────────────────────────────────────
export type PublicSeasonRow = {
  seasonStartYear: number
  seasonLabel: string
  source: 'log' | 'career'
  selfReported: boolean        // career rows are self-reported; log rows are not
  clubs: string[]
  level: string | null
  apps: number
  goals: number
  assists: number
  minutes: number
  cleanSheets: number
  motm: number
  yellowCards: number
  redCards: number
}

export type PublicPerformance = {
  visible: boolean
  hasAny: boolean
  focus: 'defensive' | 'attacking'
  // Current-season headline, competitive (league+cup) only, from the live log.
  currentSeason: { startYear: number; label: string; summary: MatchSummary } | null
  seasons: PublicSeasonRow[]   // full history, newest first
  totals: { apps: number; goals: number; assists: number; minutes: number; cleanSheets: number; motm: number }
}

// Map an allowlisted PublicMatch onto the structural shape summariseMatches
// reads. rating is never public, so it's null (avg rating stays absent from
// public views); MOTM is re-expressed as the tag summariseMatches counts.
function toAggregatable(m: PublicMatch): AggregatableMatch {
  return {
    started: m.started,
    goals: m.goals,
    assists: m.assists,
    penalty_saves: m.penalty_saves,
    tags: m.man_of_the_match ? ['man_of_the_match'] : [],
    minutes_played: m.minutes_played,
    rating: null,
    goals_for: m.goals_for,
    goals_against: m.goals_against,
  }
}

function summaryToRow(
  startYear: number,
  source: 'log' | 'career',
  selfReported: boolean,
  clubs: string[],
  level: string | null,
  s: MatchSummary,
  extra: { yellowCards: number; redCards: number },
): PublicSeasonRow {
  return {
    seasonStartYear: startYear,
    seasonLabel: seasonLabel(startYear),
    source,
    selfReported,
    clubs,
    level,
    apps: s.apps,
    goals: s.goals,
    assists: s.assists,
    minutes: s.minutes,
    cleanSheets: s.cleanSheets,
    motm: s.motmCount,
    yellowCards: extra.yellowCards,
    redCards: extra.redCards,
  }
}

function uniq(xs: (string | null)[]): string[] {
  return [...new Set(xs.filter((x): x is string => !!x))]
}

export function buildPublicPerformance(
  payload: PublicPerformancePayload,
  profilePosition: string | null | undefined,
): PublicPerformance {
  const empty: PublicPerformance = {
    visible: !!payload.visible,
    hasAny: false,
    focus: 'attacking',
    currentSeason: null,
    seasons: [],
    totals: { apps: 0, goals: 0, assists: 0, minutes: 0, cleanSheets: 0, motm: 0 },
  }
  if (!payload.visible) return empty

  const matches = payload.matches ?? []
  const career = payload.career ?? []
  if (matches.length === 0 && career.length === 0) return empty

  const focus = trackerFocus(dominantCategory(profilePosition, matches))

  // ── Group the live log by season ────────────────────────────────────────────
  const logBySeason = new Map<number, PublicMatch[]>()
  for (const m of matches) {
    const yr = seasonOfMatch(m.match_date)
    const arr = logBySeason.get(yr)
    if (arr) arr.push(m)
    else logBySeason.set(yr, [m])
  }
  const loggedSeasons = new Set(logBySeason.keys())

  const seasons: PublicSeasonRow[] = []

  // Log-sourced season rows (all competition types folded in, so history is a
  // complete record; the competitive-only cut is reserved for the headline).
  for (const [yr, ms] of logBySeason) {
    const s = summariseMatches(ms.map(toAggregatable))
    const yellowCards = ms.reduce((n, m) => n + (m.yellow_cards ?? 0), 0)
    const redCards = ms.reduce((n, m) => n + (m.red_card ? 1 : 0), 0)
    seasons.push(summaryToRow(
      yr, 'log', false,
      uniq(ms.map(m => m.club_name)),
      uniq(ms.map(m => m.club_level))[0] ?? null,
      s, { yellowCards, redCards },
    ))
  }

  // Career-sourced season rows — ONLY for seasons the log doesn't touch
  // (anti-double-count). Career rows are already per-season summaries.
  for (const c of career) {
    if (loggedSeasons.has(c.season_start_year)) continue   // superseded by the log
    seasons.push({
      seasonStartYear: c.season_start_year,
      seasonLabel: seasonLabel(c.season_start_year),
      source: 'career',
      selfReported: true,
      clubs: c.club_name ? [c.club_name] : [],
      level: c.level,
      apps: c.apps ?? 0,
      goals: c.goals ?? 0,
      assists: c.assists ?? 0,
      minutes: c.minutes ?? 0,
      cleanSheets: c.clean_sheets ?? 0,
      motm: 0,
      yellowCards: 0,
      redCards: 0,
    })
  }

  seasons.sort((a, b) => b.seasonStartYear - a.seasonStartYear)

  // ── Current-season headline: competitive only, from the log ──────────────────
  const currentYear = seasonStartYear()
  const currentLog = logBySeason.get(currentYear) ?? []
  const currentCompetitive = currentLog.filter(m => isCompetitive(m.competition_type))
  const currentSeason = currentCompetitive.length > 0
    ? { startYear: currentYear, label: seasonLabel(currentYear), summary: summariseMatches(currentCompetitive.map(toAggregatable)) }
    : null

  // ── Totals across everything rendered (log seasons + non-superseded career) ──
  const totals = seasons.reduce(
    (t, r) => ({
      apps: t.apps + r.apps,
      goals: t.goals + r.goals,
      assists: t.assists + r.assists,
      minutes: t.minutes + r.minutes,
      cleanSheets: t.cleanSheets + r.cleanSheets,
      motm: t.motm + r.motm,
    }),
    { apps: 0, goals: 0, assists: 0, minutes: 0, cleanSheets: 0, motm: 0 },
  )

  return { visible: true, hasAny: true, focus, currentSeason, seasons, totals }
}
