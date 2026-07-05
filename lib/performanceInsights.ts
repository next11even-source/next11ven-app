// Game Performance Tracker — insight rules engine
//
// Surfaces ONE relevant insight for the dashboard banner. Rules are evaluated
// in array order (most specific/celebratory first) and the first hit wins —
// add a new rule by inserting an object, no UI changes needed. Tone follows
// the weekly digest: always positive or neutral, never deflating.
//
// All rules operate on COMPETITIVE matches (league + cup) sorted newest-first,
// per the season scoping done by the caller. Stint-awareness: comparisons
// across different pyramid steps get level context appended where it matters.

import { stepNumber } from './levels'
import type { ClubStint, PerformanceMatch, TrackerFocus } from './performance'
import { involvements, isCleanSheet } from './performance'

// Tone drives the banner accent so different kinds of insight stand apart:
// streak = orange flame, best = amber star (peak moments), trend = blue bolt.
export type InsightTone = 'streak' | 'best' | 'trend'

export type Insight = { id: string; text: string; tone: InsightTone }

export type InsightContext = {
  /** Competitive matches this season, sorted match_date DESC. */
  season: PerformanceMatch[]
  /** All competitive matches ever, sorted match_date DESC. */
  career: PerformanceMatch[]
  stints: ClubStint[]
  seasonLabel: string
  /** Position-aware ordering: defensive players see clean-sheet/minutes rules first. */
  focus: TrackerFocus
}

type InsightRule = {
  id: string
  tone: InsightTone
  evaluate: (ctx: InsightContext) => string | null
}

// ── Stint helpers ─────────────────────────────────────────────────────────────

function stintOf(m: PerformanceMatch, stints: ClubStint[]): ClubStint | null {
  return m.stint_id ? stints.find(s => s.id === m.stint_id) ?? null : null
}

/**
 * When the most recent match sits at a HIGHER step than the older matches in a
 * comparison window, comparing raw numbers without context is misleading —
 * return " at Step N" to anchor the claim. Empty string when same step,
 * off-ladder, or unknown.
 */
function stepContext(matches: PerformanceMatch[], stints: ClubStint[]): string {
  if (matches.length < 2) return ''
  const latestStep = stepNumber(stintOf(matches[0], stints)?.level)
  if (latestStep == null) return ''
  const olderSteps = matches.slice(1)
    .map(m => stepNumber(stintOf(m, stints)?.level))
    .filter((n): n is number => n != null)
  if (!olderSteps.length) return ''
  // Lower step number = higher level; only call it out when they've moved up.
  return olderSteps.some(n => n > latestStep) ? ` at Step ${latestStep}` : ''
}

const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (ms: PerformanceMatch[]) => {
  const rated = ms.filter(m => m.rating != null)
  if (!rated.length) return null
  return rated.reduce((sum, m) => sum + Number(m.rating), 0) / rated.length
}

// ── Defensive rules (lead for goalkeepers and defenders) ──────────────────────

const DEFENSIVE_RULES: InsightRule[] = [
  {
    // Penalty saved in the latest game — the keeper's brag stat, always leads.
    id: 'penalty-save',
    tone: 'best',
    evaluate: ({ season }) => {
      const latest = season[0]
      if (!latest || !latest.penalty_saves) return null
      return latest.penalty_saves === 1
        ? `Penalty saved vs ${latest.opponent} — one for the highlight reel`
        : `${latest.penalty_saves} penalties saved vs ${latest.opponent} — unbeatable`
    },
  },
  {
    // Consecutive recent games with a recorded score and nothing conceded.
    id: 'clean-sheet-streak',
    tone: 'streak',
    evaluate: ({ season }) => {
      let streak = 0
      for (const m of season) {
        if (m.goals_for == null || m.goals_against == null) break
        if (!isCleanSheet(m)) break
        streak++
      }
      if (streak < 2) return null
      return `${streak} clean sheets in your last ${streak} games`
    },
  },
  {
    // Played every minute of the last 3+ games — the reliability boost.
    id: 'full-shift-run',
    tone: 'streak',
    evaluate: ({ season }) => {
      let run = 0
      for (const m of season) {
        if (m.minutes_played == null || m.minutes_played < 90) break
        run++
      }
      if (run < 3) return null
      return `Every minute of your last ${run} games — a manager's dream`
    },
  },
  {
    // Season minutes milestone, fired by the latest game crossing it.
    id: 'minutes-milestone',
    tone: 'trend',
    evaluate: ({ season }) => {
      const total = season.reduce((n, m) => n + (m.minutes_played ?? 0), 0)
      const latest = season[0]?.minutes_played ?? 0
      if (!latest) return null
      const milestone = [2700, 1800, 900].find(ms => total >= ms && total - latest < ms)
      if (!milestone) return null
      return `${total} minutes on the pitch this season — ${Math.floor(milestone / 90)} full games' worth and counting`
    },
  },
]

// ── Attacking rules ───────────────────────────────────────────────────────────

const ATTACKING_RULES: InsightRule[] = [
  {
    // Consecutive recent games with a goal involvement.
    id: 'goal-involvement-streak',
    tone: 'streak',
    evaluate: ({ season }) => {
      let streak = 0
      let contributions = 0
      for (const m of season) {
        const inv = involvements(m)
        if (inv === 0) break
        streak++
        contributions += inv
      }
      if (streak < 2) return null
      return `${contributions} goal contribution${contributions === 1 ? '' : 's'} in your last ${streak} games`
    },
  },
  {
    // Latest match is the best-rated of the season (needs 3+ rated games).
    id: 'best-rated-of-season',
    tone: 'best',
    evaluate: ({ season, stints }) => {
      const rated = season.filter(m => m.rating != null)
      if (rated.length < 3) return null
      const latest = season[0]
      if (latest.rating == null) return null
      const best = Math.max(...rated.map(m => Number(m.rating)))
      if (Number(latest.rating) < best) return null
      return `Your best-rated game of the season${stepContext(season, stints)} — ${Number(latest.rating)} vs ${latest.opponent}`
    },
  },
  {
    // Career-best goals in a single game (2+ so one goal doesn't trigger it).
    id: 'career-best-goals',
    tone: 'best',
    evaluate: ({ season, career }) => {
      const latest = season[0]
      if (!latest || latest.goals < 2) return null
      const best = Math.max(...career.map(m => m.goals))
      if (latest.goals < best) return null
      return `${latest.goals} goals vs ${latest.opponent} — your best in a single game`
    },
  },
  {
    // Rating trend since a "return from injury" tag (within last 6 games).
    id: 'return-from-injury-trend',
    tone: 'trend',
    evaluate: ({ season }) => {
      const idx = season.findIndex(m => m.tags.includes('return_from_injury'))
      if (idx < 2 || idx > 5) return null // need 2+ games logged since the return
      const returnMatch = season[idx]
      if (returnMatch.rating == null) return null
      const since = avg(season.slice(0, idx))
      if (since == null || since <= Number(returnMatch.rating)) return null
      return `Ratings climbing since your return from injury — averaging ${round1(since)} across ${idx} games`
    },
  },
  {
    // Last 3 rated games averaging at least 0.5 above the previous 3.
    id: 'rating-trend-up',
    tone: 'trend',
    evaluate: ({ season, stints }) => {
      const rated = season.filter(m => m.rating != null)
      if (rated.length < 6) return null
      const recent = avg(rated.slice(0, 3))
      const previous = avg(rated.slice(3, 6))
      if (recent == null || previous == null || recent - previous < 0.5) return null
      return `Your ratings are trending up${stepContext(rated.slice(0, 6), stints)} — last 3 games averaging ${round1(recent)}`
    },
  },
  {
    // Career competitive appearance milestones.
    id: 'apps-milestone',
    tone: 'trend',
    evaluate: ({ career }) => {
      const milestones = [10, 25, 50, 75, 100, 150, 200]
      if (!milestones.includes(career.length)) return null
      return `That's ${career.length} logged appearances — your record is building`
    },
  },
  {
    // Latest game tagged as a first start.
    id: 'first-start',
    tone: 'best',
    evaluate: ({ season }) => {
      const latest = season[0]
      if (!latest || !latest.tags.includes('first_start')) return null
      return `First start logged, vs ${latest.opponent} — one to build on`
    },
  },
  {
    // Latest game tagged man of the match.
    id: 'man-of-the-match',
    tone: 'best',
    evaluate: ({ season }) => {
      const latest = season[0]
      if (!latest || !latest.tags.includes('man_of_the_match')) return null
      return `Man of the match vs ${latest.opponent}`
    },
  },
]

/**
 * First rule that fires wins. Null = banner hidden (never a filler message).
 * Defensive players (GK/DEF) get clean-sheet and minutes rules first; everyone
 * still gets every rule — only the priority order changes.
 */
export function generateInsight(ctx: InsightContext): Insight | null {
  if (!ctx.season.length) return null
  const rules = ctx.focus === 'defensive'
    ? [...DEFENSIVE_RULES, ...ATTACKING_RULES]
    : [...ATTACKING_RULES, ...DEFENSIVE_RULES]
  for (const rule of rules) {
    const text = rule.evaluate(ctx)
    if (text) return { id: rule.id, text, tone: rule.tone }
  }
  return null
}
