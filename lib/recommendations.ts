/**
 * Coach Recommendation Engine — matching algorithm.
 * Server-side only (requires a service-role Supabase client).
 *
 * Scoring model (higher = better):
 *   step match        0–30  coach's coaching_level vs player's playing_level
 *   position taste    0–25  weighted by the coach's cumulative search history
 *   profile complete  0–15  reuses the 12-check completion score
 *   recently active   0–15  last_active within 30 days weighted highest
 *   location match    0–10  player city matches coach city or searched locations
 *
 * Pools:
 *   primary   = coach step ±1
 *   secondary = coach step ±2 (only used if primary can't fill the limit)
 *   anything beyond ±2 is never recommended.
 *   Players with no playing_level set are eligible but score 0 on step match.
 *
 * Geography is a soft scoring signal (city is free text — no radius data),
 * so the "loosen geography" fallback is inherent: non-matching locations are
 * ranked lower rather than filtered out.
 *
 * Exclusions:
 *   - players the coach already has a conversation with (always)
 *   - email surface only: players emailed to this coach in the last 6 weeks
 *   We return fewer than `limit` rather than repeat excluded players.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcCompletion } from '@/lib/profileCompletion'

export type RecommendedPlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  secondary_position: string | null
  playing_level: string | null
  status: string | null
  city: string | null
  club: string | null
  score: number
}

export type RecommendationResult = {
  players: RecommendedPlayer[]
  hasSearchHistory: boolean
}

type CandidateRow = RecommendedPlayer & {
  last_active: string | null
  highlight_urls: string[] | null
  phone: string | null
  date_of_birth: string | null
  foot: string | null
  height: string | null
  goals: number | null
  assists: number | null
  appearances: number | null
}

const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const HISTORY_SAMPLE = 200

/** Parse 'Step 4' → 4. Returns null for missing/unparseable levels. */
function stepNumber(level: string | null | undefined): number | null {
  if (!level) return null
  const m = level.match(/step\s*(\d)/i)
  return m ? parseInt(m[1], 10) : null
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export async function getRecommendedPlayers(
  supabase: SupabaseClient,
  coachId: string,
  surface: 'email' | 'in_app',
  limit: number
): Promise<RecommendationResult> {
  // ── Coach context + taste profile + exclusions, in parallel ────────────────
  const sixWeeksAgo = new Date(Date.now() - SIX_WEEKS_MS).toISOString()

  const [coachRes, historyRes, convosRes, emailLogRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('coaching_level, city')
      .eq('id', coachId)
      .single(),
    supabase
      .from('coach_search_history')
      .select('filters_used')
      .eq('coach_id', coachId)
      .order('searched_at', { ascending: false })
      .limit(HISTORY_SAMPLE),
    supabase
      .from('conversations')
      .select('player_id')
      .eq('coach_id', coachId),
    surface === 'email'
      ? supabase
          .from('coach_recommendation_log')
          .select('player_id')
          .eq('coach_id', coachId)
          .eq('surface', 'email')
          .gte('recommended_at', sixWeeksAgo)
      : Promise.resolve({ data: [] as { player_id: string }[], error: null }),
  ])

  if (coachRes.error || !coachRes.data) {
    throw new Error(`Coach profile not found for ${coachId}`)
  }

  const coachStep = stepNumber(coachRes.data.coaching_level)
  const coachCity = norm(coachRes.data.city)

  // Cumulative taste profile: positions searched more often weigh more.
  const positionWeights = new Map<string, number>()
  const searchedLocations = new Set<string>()
  const history = historyRes.data ?? []
  for (const row of history) {
    const f = (row.filters_used ?? {}) as Record<string, unknown>
    if (typeof f.position === 'string' && f.position) {
      const key = norm(f.position)
      positionWeights.set(key, (positionWeights.get(key) ?? 0) + 1)
    }
    if (typeof f.location === 'string' && f.location) {
      searchedLocations.add(norm(f.location))
    }
  }
  const maxPositionWeight = Math.max(0, ...positionWeights.values())
  const hasSearchHistory = history.length > 0

  const excluded = new Set<string>([coachId])
  for (const row of convosRes.data ?? []) excluded.add(row.player_id)
  for (const row of emailLogRes.data ?? []) excluded.add(row.player_id)

  // ── Candidate pool ──────────────────────────────────────────────────────────
  const { data: candidates, error: candidatesError } = await supabase
    .from('profiles')
    .select(
      'id, full_name, avatar_url, position, secondary_position, playing_level, status, city, club, last_active, highlight_urls, phone, date_of_birth, foot, height, goals, assists, appearances'
    )
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .limit(1000)

  if (candidatesError) {
    throw new Error(`Candidate query failed: ${candidatesError.message}`)
  }

  const now = Date.now()
  type Scored = { player: RecommendedPlayer; stepDiff: number | null; score: number }
  const scored: Scored[] = []

  for (const raw of (candidates ?? []) as CandidateRow[]) {
    if (excluded.has(raw.id)) continue

    const playerStep = stepNumber(raw.playing_level)
    const stepDiff =
      coachStep !== null && playerStep !== null ? Math.abs(coachStep - playerStep) : null

    // Hard cutoff: never recommend wildly outside the coach's range.
    if (stepDiff !== null && stepDiff > 2) continue

    let score = 0

    // Step adjacency (0–30). Unknown levels are eligible but unrewarded.
    if (stepDiff === 0) score += 30
    else if (stepDiff === 1) score += 22
    else if (stepDiff === 2) score += 8

    // Position taste (0–25), secondary position at half weight.
    if (maxPositionWeight > 0) {
      const primaryW = positionWeights.get(norm(raw.position)) ?? 0
      const secondaryW = positionWeights.get(norm(raw.secondary_position)) ?? 0
      const w = Math.max(primaryW, secondaryW * 0.5)
      score += (w / maxPositionWeight) * 25
    }

    // Profile completeness (0–15).
    const { pct } = calcCompletion({
      avatar_url: raw.avatar_url,
      position: raw.position,
      club: raw.club,
      city: raw.city,
      status: raw.status,
      phone: raw.phone,
      date_of_birth: raw.date_of_birth,
      foot: raw.foot,
      height: raw.height,
      playing_level: raw.playing_level,
      highlight_urls: raw.highlight_urls,
      goals: raw.goals ?? 0,
      assists: raw.assists ?? 0,
      appearances: raw.appearances ?? 0,
    })
    score += (pct / 100) * 15

    // Recency (0–15): active in the last 30 days weighted highest.
    if (raw.last_active) {
      const age = now - new Date(raw.last_active).getTime()
      if (age <= THIRTY_DAYS_MS) score += 15
      else if (age <= NINETY_DAYS_MS) score += 5
    }

    // Location proximity (0–10): coach's own city, or cities they search for.
    const playerCity = norm(raw.city)
    if (playerCity) {
      const matchesCoach =
        coachCity && (playerCity.includes(coachCity) || coachCity.includes(playerCity))
      const matchesSearched = Array.from(searchedLocations).some(
        loc => playerCity.includes(loc) || loc.includes(playerCity)
      )
      if (matchesCoach || matchesSearched) score += 10
    }

    scored.push({
      player: {
        id: raw.id,
        full_name: raw.full_name,
        avatar_url: raw.avatar_url,
        position: raw.position,
        secondary_position: raw.secondary_position,
        playing_level: raw.playing_level,
        status: raw.status,
        city: raw.city,
        club: raw.club,
        score: Math.round(score * 10) / 10,
      },
      stepDiff,
      score,
    })
  }

  scored.sort((a, b) => b.score - a.score)

  // Primary pool: ±1 step (or unknown). Secondary pool (±2) only fills the gap.
  const primary = scored.filter(s => s.stepDiff === null || s.stepDiff <= 1)
  const secondary = scored.filter(s => s.stepDiff === 2)

  const picked = primary.slice(0, limit)
  if (picked.length < limit) {
    picked.push(...secondary.slice(0, limit - picked.length))
  }
  picked.sort((a, b) => b.score - a.score)

  return {
    players: picked.map(s => s.player),
    hasSearchHistory,
  }
}

/**
 * Persist a batch of recommendations to coach_recommendation_log.
 * Best-effort — callers should not fail the request if logging fails.
 */
export async function logRecommendations(
  supabase: SupabaseClient,
  coachId: string,
  playerIds: string[],
  surface: 'email' | 'in_app'
): Promise<void> {
  if (playerIds.length === 0) return
  const { error } = await supabase.from('coach_recommendation_log').insert(
    playerIds.map(player_id => ({ coach_id: coachId, player_id, surface }))
  )
  if (error) {
    console.error('[recommendations] log insert failed:', error)
  }
}
