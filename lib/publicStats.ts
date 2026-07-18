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

// Map raw performance_matches rows (with a club_stints join) into the
// allowlisted public shape — MOTM derived from tags to a boolean; notes/tags/
// rating never carried across. Used server-side wherever owner rows are turned
// into a public aggregate (share card, coach dashboard).
export function toPublicMatches(rows: Record<string, unknown>[]): PublicMatch[] {
  return rows.map(m => ({
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

// Per-90 / per-game normalisation — the numbers that make a 22-game season
// comparable to a 40-game one. null when there's nothing to divide by.
export type PublicRates = {
  per90Goals: number | null
  per90Assists: number | null
  per90Involvements: number | null
  perGameGoals: number | null
  perGameInvolvements: number | null
}

// Recent form — public-safe (results from scores + goal involvements; never the
// private self-rating). Newest first.
export type PublicForm = {
  results: ('W' | 'D' | 'L')[]   // last up-to-5 matches that had a score
  involvementsLast5: number      // G+A across the last up-to-5 matches
}

// Availability/durability as a first-class stat — no dishonest "%", just the
// concrete signals we actually capture.
export type PublicDurability = {
  starts: number
  apps: number
  minutes: number
  avgMinutes: number | null
  gamesLast6Weeks: number
  startStreak: number            // consecutive most-recent games started
}

export type PublicCurrentDetail = {
  rates: PublicRates
  form: PublicForm
  durability: PublicDurability
  discipline: { yellowCards: number; redCards: number }
  involvementStreak: number      // consecutive most-recent games with a goal or assist
}

export type PublicPerformance = {
  visible: boolean
  hasAny: boolean
  focus: 'defensive' | 'attacking'
  level: string | null           // current level/step context (most recent logged club level)
  versatility: string[]          // distinct positions played this season
  // Current-season headline, competitive (league+cup) only, from the live log.
  currentSeason: { startYear: number; label: string; summary: MatchSummary } | null
  currentDetail: PublicCurrentDetail | null
  seasons: PublicSeasonRow[]     // full history, newest first
  totals: { apps: number; goals: number; assists: number; minutes: number; cleanSheets: number; motm: number }
  avgMinutes: number | null      // career avg minutes/game over seasons that recorded minutes
  milestones: string[]           // career milestones crossed (e.g. "100 career appearances")
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

const round2 = (n: number) => Math.round(n * 100) / 100

function computeRates(s: MatchSummary): PublicRates {
  const inv = s.goals + s.assists
  const per90 = (v: number) => (s.minutes > 0 ? round2((v / s.minutes) * 90) : null)
  const perGame = (v: number) => (s.apps > 0 ? round2(v / s.apps) : null)
  return {
    per90Goals: per90(s.goals),
    per90Assists: per90(s.assists),
    per90Involvements: per90(inv),
    perGameGoals: perGame(s.goals),
    perGameInvolvements: perGame(inv),
  }
}

// matches must be newest-first (as the RPC returns them).
function computeForm(matches: PublicMatch[]): PublicForm {
  const last5 = matches.slice(0, 5)
  const results: ('W' | 'D' | 'L')[] = []
  for (const m of last5) {
    if (m.goals_for == null || m.goals_against == null) continue
    results.push(m.goals_for > m.goals_against ? 'W' : m.goals_for === m.goals_against ? 'D' : 'L')
  }
  const involvementsLast5 = last5.reduce((n, m) => n + m.goals + m.assists, 0)
  return { results, involvementsLast5 }
}

function computeDurability(s: MatchSummary, matches: PublicMatch[], now: Date): PublicDurability {
  const sixWeeksAgo = new Date(now.getTime() - 42 * 86_400_000).toISOString().slice(0, 10)
  const gamesLast6Weeks = matches.filter(m => m.match_date >= sixWeeksAgo).length
  let startStreak = 0
  for (const m of matches) { if (m.started) startStreak++; else break }
  return { starts: s.starts, apps: s.apps, minutes: s.minutes, avgMinutes: s.avgMinutes, gamesLast6Weeks, startStreak }
}

// Consecutive most-recent games with a goal or assist (newest-first input).
function involvementStreak(matches: PublicMatch[]): number {
  let streak = 0
  for (const m of matches) { if (m.goals + m.assists > 0) streak++; else break }
  return streak
}

function careerMilestones(totals: { apps: number; goals: number; assists: number; motm: number }): string[] {
  const out: string[] = []
  const highest = (v: number, steps: number[]) => steps.filter(t => v >= t).pop() ?? null
  const apps = highest(totals.apps, [50, 100, 150, 200, 250, 300])
  if (apps) out.push(`${apps}+ career appearances`)
  const goals = highest(totals.goals, [10, 25, 50, 75, 100, 150])
  if (goals) out.push(`${goals}+ career goals`)
  const assists = highest(totals.assists, [25, 50, 100])
  if (assists) out.push(`${assists}+ career assists`)
  if (totals.motm >= 5) out.push(`${highest(totals.motm, [5, 10, 20, 30])}+ Man of the match awards`)
  return out
}

export function buildPublicPerformance(
  payload: PublicPerformancePayload,
  profilePosition: string | null | undefined,
): PublicPerformance {
  const empty: PublicPerformance = {
    visible: !!payload.visible,
    hasAny: false,
    focus: 'attacking',
    level: null,
    versatility: [],
    currentSeason: null,
    currentDetail: null,
    seasons: [],
    totals: { apps: 0, goals: 0, assists: 0, minutes: 0, cleanSheets: 0, motm: 0 },
    avgMinutes: null,
    milestones: [],
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

  // ── Current-season headline + detail: competitive only, from the log ─────────
  const currentYear = seasonStartYear()
  const currentLog = logBySeason.get(currentYear) ?? []           // newest-first
  const currentCompetitive = currentLog.filter(m => isCompetitive(m.competition_type))
  const currentSummary = currentCompetitive.length > 0 ? summariseMatches(currentCompetitive.map(toAggregatable)) : null
  const currentSeason = currentSummary
    ? { startYear: currentYear, label: seasonLabel(currentYear), summary: currentSummary }
    : null

  const currentDetail: PublicCurrentDetail | null = currentSummary
    ? {
        rates: computeRates(currentSummary),
        form: computeForm(currentCompetitive),
        durability: computeDurability(currentSummary, currentCompetitive, new Date()),
        discipline: {
          yellowCards: currentCompetitive.reduce((n, m) => n + (m.yellow_cards ?? 0), 0),
          redCards: currentCompetitive.reduce((n, m) => n + (m.red_card ? 1 : 0), 0),
        },
        involvementStreak: involvementStreak(currentCompetitive),
      }
    : null

  // Step/level context: the most recent logged club level, else newest season.
  const level = currentLog.find(m => m.club_level)?.club_level
    ?? matches.find(m => m.club_level)?.club_level
    ?? seasons.find(s => s.level)?.level
    ?? null

  // Versatility: distinct positions played this season (falls back to all-time
  // when the player hasn't logged a competitive game yet).
  const versatilitySource = currentCompetitive.length > 0 ? currentCompetitive : matches
  const versatility = uniq(versatilitySource.map(m => m.position))

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

  // Career avg minutes/game — averaged only over seasons that actually recorded
  // minutes, so seasons with no minutes data don't drag it down. Applies to
  // every position, and isn't surfaced anywhere else.
  const minutesSeasons = seasons.filter(s => s.minutes > 0 && s.apps > 0)
  const minutesApps = minutesSeasons.reduce((n, s) => n + s.apps, 0)
  const avgMinutes = minutesApps > 0
    ? Math.round(minutesSeasons.reduce((n, s) => n + s.minutes, 0) / minutesApps)
    : null

  return {
    visible: true, hasAny: true, focus, level, versatility,
    currentSeason, currentDetail, seasons, totals, avgMinutes,
    milestones: careerMilestones(totals),
  }
}
