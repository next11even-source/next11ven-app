export const LEVELS = [
  'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7',
  'U18s/Academy', 'Wales 1', 'Wales 2', 'Other',
] as const

export type Level = typeof LEVELS[number]

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
