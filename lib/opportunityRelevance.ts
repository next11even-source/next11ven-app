import { stepNumber } from '@/lib/levels'
import { positionCategory } from '@/lib/positions'

export type RelevanceOpportunity = {
  position: string | null
  level: string | null
  location: string | null
  created_at: string
}

export type RelevancePlayerProfile = {
  position: string | null
  secondary_position: string | null
  playing_level: string | null
  city: string | null
  location: string | null
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/**
 * Ranks how relevant an opportunity is to a player — a soft ordering signal
 * only, never a filter (see PlayerOpportunities.tsx: nothing is hidden, the
 * full list is just reordered). Mirrors the step-adjacency + coarse-location
 * approach the coach recommendation engine uses (lib/recommendations.ts),
 * applied in reverse (ranking roles for a player instead of players for a
 * coach) — same tiering, same "location is a weak text signal" limitation.
 *
 * Step proximity is deliberately the dominant axis, not just the highest
 * weight: a Step 5 "Any position" role must always outrank a Step 7 exact
 * position match for a Step 5 player — being asked to play out of position
 * is fine, being asked to play two divisions off is a much worse match.
 * The step tiers are spaced further apart than the maximum combined
 * position + location + recency score (58) can ever bridge, so position/
 * location/recency only ever break ties within the same step tier.
 */
export function getOpportunityRelevanceScore(
  opportunity: RelevanceOpportunity,
  player: RelevancePlayerProfile
): number {
  let score = 0

  // Position match (0–40): exact primary/secondary match scores highest,
  // same broad category (lib/positions.ts groups RW/LW etc. together as
  // "attackers") gets partial credit, unrelated positions score low. An
  // opportunity open to "Any position" fits everyone, so it gets a flat
  // mid-value rather than being penalised as unrelated.
  const oppPos = norm(opportunity.position)
  if (!oppPos) {
    score += 18
  } else if (oppPos === norm(player.position) || oppPos === norm(player.secondary_position)) {
    score += 40
  } else {
    const oppCategory = positionCategory(opportunity.position)
    const playerCategory = positionCategory(player.position) ?? positionCategory(player.secondary_position)
    score += oppCategory && oppCategory === playerCategory ? 20 : 4
  }

  // Step proximity (0–320, dominant axis): exact step match highest, ±1
  // next, further steps lower still — see function-level comment for why
  // the gaps are this wide. Off-ladder levels (U18s/Academy, Wales, Other)
  // or an unset level on either side score 0 here — never excluded, only
  // unweighted, so they fall in behind any opportunity with a known step.
  const playerStep = stepNumber(player.playing_level)
  const oppStep = stepNumber(opportunity.level)
  if (playerStep !== null && oppStep !== null) {
    const diff = Math.abs(playerStep - oppStep)
    if (diff === 0) score += 320
    else if (diff === 1) score += 240
    else if (diff === 2) score += 160
    else if (diff === 3) score += 80
  }

  // Location proximity (0–15): free text only on both sides (no lat/long or
  // postcode anywhere in the schema), so this is a coarse substring match
  // against the player's city or location field — same weak-signal tradeoff
  // the coach engine already accepts.
  const oppLoc = norm(opportunity.location)
  if (oppLoc) {
    const playerCity = norm(player.city)
    const playerLoc = norm(player.location)
    const matches = [playerCity, playerLoc].some(
      loc => loc && (loc.includes(oppLoc) || oppLoc.includes(loc))
    )
    if (matches) score += 15
  }

  // Recency (0–3, lowest weight): continuous exponential decay with a
  // ~14-day half-life, used only to break ties between similarly-scored
  // opportunities — never enough to outrank a real position/step/location
  // signal.
  const ageDays = (Date.now() - new Date(opportunity.created_at).getTime()) / 86400000
  score += 3 * Math.pow(0.5, ageDays / 14)

  return Math.round(score * 100) / 100
}
