export const LEVELS = [
  'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7',
  'U18s/Academy', 'Wales 1', 'Wales 2', 'Other',
] as const

export type Level = typeof LEVELS[number]

// Broader ladder for logging PAST history in the tracker (club stints and
// career/season rows) — a player's pedigree can include professional football
// before they dropped into the non-league pyramid. The platform's core
// "Playing Level" field (current level, used for matching/filtering) stays on
// LEVELS only; this is additive and scoped to tracker history.
export const TRACKER_LEVELS = [
  'Premier League', 'Championship', 'League 1', 'League 2',
  ...LEVELS,
] as const

export type TrackerLevel = typeof TRACKER_LEVELS[number]

// Sorts arbitrary level strings (e.g. distinct values pulled from live data)
// into the canonical LEVELS order — Step 1 first, Other last. Values outside
// LEVELS (legacy/off-list) sort after everything else.
export function sortLevels(levels: string[]): string[] {
  const rank = (l: string) => {
    const i = LEVELS.indexOf(l as Level)
    return i === -1 ? LEVELS.length : i
  }
  return [...levels].sort((a, b) => rank(a) - rank(b))
}

// ─── Step ladder helpers ──────────────────────────────────────────────────────
// On the non-league pyramid a LOWER step number = HIGHER level (Step 1 is the
// top). Only "Step N" values sit on the comparable ladder; U18s/Academy, Wales
// and Other are off-ladder and never compared.

/** Returns 1–7 for "Step N", else null (off-ladder / unset). */
export function stepNumber(level: string | null | undefined): number | null {
  if (!level) return null
  const m = /^Step\s+([1-7])$/.exec(level.trim())
  return m ? parseInt(m[1], 10) : null
}

/**
 * Ranks any TRACKER_LEVELS value (pro tiers, Step 1-7, academy, Wales, Other)
 * for pedigree/trajectory comparisons — e.g. "peak level reached" vs a
 * player's current playing level. Lower rank = higher level. null for values
 * outside TRACKER_LEVELS (never claimed as a peak).
 */
export function trackerLevelRank(level: string | null | undefined): number | null {
  if (!level) return null
  const i = TRACKER_LEVELS.indexOf(level as TrackerLevel)
  return i === -1 ? null : i
}

/**
 * "U18s/Academy", "Wales 1", "Wales 2" and "Other" are off-ladder per the
 * comment above — real values, but not a rung on the comparable Step pyramid
 * (Other in particular can mean anything from Sunday league to an unlisted
 * country's top flight). trackerLevelRank still assigns them a numeric index
 * for sorting, but that index must never be subtracted against another
 * level's rank to claim a specific "N levels above/below" gap — the distance
 * to an unknown quantity isn't a number. Callers computing a pedigree gap
 * should treat either side as unusable the moment this returns true.
 */
export function isOffLadderLevel(level: string | null | undefined): boolean {
  return level === 'U18s/Academy' || level === 'Wales 1' || level === 'Wales 2' || level === 'Other'
}

/**
 * For the locked-message trigger: reveal the coach's club step ONLY when it's a
 * strong signal — i.e. the coach's club is at or above the player's own level.
 * Returns the coach's step label (e.g. "Step 2") to display, or null to stay
 * generic ("A coach messaged you") when the coach is lower, off-ladder, or unset
 * — or when we don't know the player's level.
 */
export function revealCoachStep(
  playerLevel: string | null | undefined,
  coachLevel: string | null | undefined,
): string | null {
  const playerStep = stepNumber(playerLevel)
  const coachStep = stepNumber(coachLevel)
  if (playerStep == null || coachStep == null) return null
  // coach at or above player => coach's step number <= player's step number
  return coachStep <= playerStep ? `Step ${coachStep}` : null
}
