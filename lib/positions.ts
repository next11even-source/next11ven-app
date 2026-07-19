export const POSITIONS = ['GK', 'LB', 'LWB', 'RB', 'RWB', 'CB', 'CM', 'RW', 'LW', 'ST', 'Winger'] as const

export type Position = typeof POSITIONS[number]

// ─── Position → broad category ────────────────────────────────────────────────
// Used for player-facing copy (e.g. the live coach count) so we say "defenders"
// instead of a hyper-specific "lbs". Plural form is the value.
export type PositionCategory = 'goalkeepers' | 'defenders' | 'midfielders' | 'attackers'

export const POSITION_CATEGORIES: PositionCategory[] = ['goalkeepers', 'defenders', 'midfielders', 'attackers']

const POSITION_CATEGORY: Record<string, PositionCategory> = {
  GK: 'goalkeepers',
  LB: 'defenders',
  LWB: 'defenders',
  RB: 'defenders',
  RWB: 'defenders',
  CB: 'defenders',
  CM: 'midfielders',
  RW: 'attackers',
  LW: 'attackers',
  ST: 'attackers',
  Winger: 'attackers',
}

/**
 * Maps a stored position (e.g. "CM", "LB") to its broad category plural
 * ("midfielders", "defenders"). Case-insensitive. Returns null for unknown /
 * unset positions so callers can fall back to generic copy.
 */
export function positionCategory(position: string | null | undefined): PositionCategory | null {
  if (!position) return null
  const key = position.trim()
  // Match case-insensitively against the known keys.
  const match = Object.keys(POSITION_CATEGORY).find(k => k.toLowerCase() === key.toLowerCase())
  return match ? POSITION_CATEGORY[match] : null
}

/**
 * True when a position denotes a goalkeeper. Robust to free-text opportunity
 * positions ("GK", "Goalkeeper", "Keeper", "Goalie") as well as stored codes.
 * Used to keep the GK/outfield boundary hard: outfield players are never shown
 * GK roles, and goalkeepers are never shown outfield roles.
 */
export function isGoalkeeper(position: string | null | undefined): boolean {
  if (!position) return false
  if (positionCategory(position) === 'goalkeepers') return true
  const p = position.trim().toLowerCase()
  return p === 'gk' || p === 'keeper' || p.includes('goalkeep') || p.includes('goalie')
}

/**
 * Returns every position that shares a category with the given position
 * (e.g. "LB" → ["LB", "RB", "CB"]). Used to widen demand counts so they match
 * the broadened category copy. Returns [position] for unknown positions, or []
 * when none supplied.
 */
export function positionsInSameCategory(position: string | null | undefined): string[] {
  const category = positionCategory(position)
  if (!category) return position ? [position] : []
  return Object.keys(POSITION_CATEGORY).filter(k => POSITION_CATEGORY[k] === category)
}
