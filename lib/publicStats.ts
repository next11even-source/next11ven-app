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
import { trackerLevelRank } from './levels'

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
  starts: number | null   // null = career/self-reported row, starts vs sub not tracked
  goals: number
  assists: number
  minutes: number
  cleanSheets: number
  motm: number
  yellowCards: number
  redCards: number
}

// Minimum minutes before a per-90 rate is shown as fact — 3 full games.
// Below this the sample is noise: a squad player two sub appearances into a
// season renders "0.00 goals / 90" off 30 minutes, which a coach reads as
// "doesn't score" rather than "hasn't played". Withhold rather than mislead.
// Single source of truth — used by the public profile and Coach Pro search.
export const RATE_MIN_MINUTES = 270

// Per-90 / per-game normalisation — the numbers that make a 22-game season
// comparable to a 40-game one. null when there's nothing to divide by, and
// null below RATE_MIN_MINUTES regardless of what the arithmetic would give.
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

// Career output split by the level it was actually achieved at. `totals` blends
// every season into one number, which is honest on the player's own profile
// (the season table sits right underneath it, each row level-labelled) but
// actively misleading anywhere a single career line stands alone — a coach
// reads "75 apps · 60G · 34A" as senior output when it's an academy season.
// Any surface that shows career output WITHOUT the season table must render
// this breakdown instead of `totals`. Highest level first; unranked last.
export type PublicLevelTotals = {
  level: string | null
  apps: number
  goals: number
  assists: number
  minutes: number
  seasons: number
}

export type PublicPerformance = {
  visible: boolean
  hasAny: boolean
  focus: 'defensive' | 'attacking'
  level: string | null           // level most of the newest season's appearances were played at
  versatility: string[]          // distinct positions played this season
  // Current-season headline, competitive (league+cup) only, from the live log.
  currentSeason: { startYear: number; label: string; summary: MatchSummary } | null
  currentDetail: PublicCurrentDetail | null
  seasons: PublicSeasonRow[]     // full history, newest first
  totals: { apps: number; goals: number; assists: number; minutes: number; cleanSheets: number; motm: number }
  careerByLevel: PublicLevelTotals[]  // `totals` split by level — see PublicLevelTotals
  avgMinutes: number | null      // career avg minutes/game over seasons that recorded minutes
  avgMinutesApps: number         // appearances that average was drawn from — compare against
                                 // totals.apps before showing it, or a 2-game average ends up
                                 // captioning a 206-game career
  startsContext: { starts: number; apps: number } | null  // starts/apps over seasons with a known starts count only
  preseasonGamesLogged: number    // pre-season/friendly matches logged this year — not counted in seasons/totals
  milestones: string[]           // career milestones crossed (e.g. "100 career appearances")
  pedigree: { peakLevel: string | null; academyBackground: boolean }  // derived from seasons[].level — no extra player input
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
    starts: s.starts,
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

// The level most of a season's logged appearances were actually played at —
// not just the most recent. A mid-season drop to a lower level shouldn't erase
// the higher level the player spent most of the season at.
function dominantLevel(ms: { club_level: string | null }[]): string | null {
  const counts = new Map<string, number>()
  for (const m of ms) {
    if (!m.club_level) continue
    counts.set(m.club_level, (counts.get(m.club_level) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [level, count] of counts) {
    if (count > bestCount) { best = level; bestCount = count }
  }
  return best
}

const round2 = (n: number) => Math.round(n * 100) / 100

function computeRates(s: MatchSummary): PublicRates {
  const inv = s.goals + s.assists
  const per90 = (v: number) => (s.minutes >= RATE_MIN_MINUTES ? round2((v / s.minutes) * 90) : null)
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
    careerByLevel: [],
    avgMinutes: null,
    avgMinutesApps: 0,
    startsContext: null,
    preseasonGamesLogged: 0,
    milestones: [],
    pedigree: { peakLevel: null, academyBackground: false },
  }
  if (!payload.visible) return empty

  const matches = payload.matches ?? []
  const career = payload.career ?? []
  if (matches.length === 0 && career.length === 0) return empty

  const focus = trackerFocus(dominantCategory(profilePosition, matches))

  // Coach-facing numbers are competitive only (league + cup) — pre-season and
  // friendlies are logged and get a separate reassurance line (below) so a
  // profile doesn't look blank before competitive games start, but they never
  // feed season totals, career totals, milestones or the level shown per
  // season. Mirrors the same competitive-only standard the private tracker
  // dashboard already applies to its own headline number.
  const competitiveMatches = matches.filter(m => isCompetitive(m.competition_type))

  // ── Group the live log by season ────────────────────────────────────────────
  const logBySeason = new Map<number, PublicMatch[]>()
  for (const m of competitiveMatches) {
    const yr = seasonOfMatch(m.match_date)
    const arr = logBySeason.get(yr)
    if (arr) arr.push(m)
    else logBySeason.set(yr, [m])
  }
  const loggedSeasons = new Set(logBySeason.keys())

  const seasons: PublicSeasonRow[] = []

  // Log-sourced season rows — competitive matches only (see above).
  for (const [yr, ms] of logBySeason) {
    const s = summariseMatches(ms.map(toAggregatable))
    const yellowCards = ms.reduce((n, m) => n + (m.yellow_cards ?? 0), 0)
    const redCards = ms.reduce((n, m) => n + (m.red_card ? 1 : 0), 0)
    seasons.push(summaryToRow(
      yr, 'log', false,
      uniq(ms.map(m => m.club_name)),
      dominantLevel(ms),
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
      starts: null,
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
  const currentCompetitive = logBySeason.get(currentYear) ?? []   // newest-first, already competitive-only
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

  // Step/level context: the level most of the newest season's appearances were
  // played at (seasons is already sorted newest-first, and each row's level is
  // already the apps-weighted dominant level for that season).
  const level = seasons.find(s => s.level)?.level ?? null

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

  // Same output as `totals`, split by the level it was played at. Seasons with
  // no level group under a single null bucket rather than being dropped, so the
  // segments always add back up to `totals`.
  const levelBuckets = new Map<string, PublicLevelTotals>()
  for (const s of seasons) {
    const key = s.level ?? ''
    const b = levelBuckets.get(key) ?? { level: s.level, apps: 0, goals: 0, assists: 0, minutes: 0, seasons: 0 }
    b.apps += s.apps
    b.goals += s.goals
    b.assists += s.assists
    b.minutes += s.minutes
    b.seasons += 1
    levelBuckets.set(key, b)
  }
  // Highest level first (off-ladder values last), then most appearances.
  const careerByLevel = [...levelBuckets.values()].sort((a, b) => {
    const ra = trackerLevelRank(a.level) ?? Number.MAX_SAFE_INTEGER
    const rb = trackerLevelRank(b.level) ?? Number.MAX_SAFE_INTEGER
    return ra - rb || b.apps - a.apps
  })

  // Career avg minutes/game — averaged only over seasons that actually recorded
  // minutes, so seasons with no minutes data don't drag it down. Applies to
  // every position, and isn't surfaced anywhere else.
  const minutesSeasons = seasons.filter(s => s.minutes > 0 && s.apps > 0)
  const minutesApps = minutesSeasons.reduce((n, s) => n + s.apps, 0)
  const avgMinutes = minutesApps > 0
    ? Math.round(minutesSeasons.reduce((n, s) => n + s.minutes, 0) / minutesApps)
    : null

  // Starts context for the avg-minutes line — only over seasons where starts
  // vs. sub appearances is actually tracked (log rows), so self-reported
  // seasons with no starts data don't silently zero out the ratio.
  const knownStartsSeasons = seasons.filter((s): s is PublicSeasonRow & { starts: number } => s.starts != null)
  const startsContext = knownStartsSeasons.length > 0
    ? {
        starts: knownStartsSeasons.reduce((n, s) => n + s.starts, 0),
        apps: knownStartsSeasons.reduce((n, s) => n + s.apps, 0),
      }
    : null

  // Pedigree — derived entirely from tracked/self-reported season levels, no
  // extra player input. Peak level only counts when it's actually on the
  // TRACKER_LEVELS ladder (off-list values are never claimed as a "peak").
  const rankedLevels = seasons
    .map(s => ({ level: s.level, rank: trackerLevelRank(s.level) }))
    .filter((x): x is { level: string; rank: number } => x.rank != null)
  const peakLevel = rankedLevels.length > 0
    ? rankedLevels.reduce((best, cur) => (cur.rank < best.rank ? cur : best)).level
    : null
  const academyBackground = seasons.some(s => s.level === 'U18s/Academy')

  // Pre-season games logged this year, from the raw (unfiltered) log — kept
  // separate from `seasons`/`totals` so a player who's only logged warm-up
  // fixtures so far still gets an honest "games logged" line instead of a
  // blank profile, without those fixtures counting as season/career stats.
  const preseasonGamesLogged = matches.filter(m => seasonOfMatch(m.match_date) === currentYear && !isCompetitive(m.competition_type)).length

  return {
    // hasAny gates whether the Performance section renders at all — true when
    // there's at least one real (competitive or self-reported) season, OR
    // pre-season activity to show the reassurance line for.
    visible: true, hasAny: seasons.length > 0 || preseasonGamesLogged > 0, focus, level, versatility,
    currentSeason, currentDetail, seasons, totals, careerByLevel, avgMinutes, avgMinutesApps: minutesApps, startsContext, preseasonGamesLogged,
    milestones: careerMilestones(totals),
    pedigree: { peakLevel, academyBackground },
  }
}
