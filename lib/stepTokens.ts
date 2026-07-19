import { stepNumber } from '@/lib/levels'

// ─── Step colour tokens — SINGLE SOURCE OF TRUTH for step colour ──────────────
//
// Every surface that colours a non-league step (opportunity step badges, the
// left accent rail, level badges via lib/opportunityLevel.ts, future map pins /
// filter chips) MUST pull from here. Do not hardcode a step colour anywhere
// else — if you need one, import STEP_TOKENS / getStepToken.
//
// On the pyramid a LOWER number = HIGHER level (Step 1 is the top). Key 0 is the
// slate "OTHER" fallback for off-ladder / unknown levels.

export const STEP_TOKENS = {
  1: { color: '#FACC15', label: 'STEP 1' }, // gold
  2: { color: '#22C55E', label: 'STEP 2' }, // green
  3: { color: '#14B8A6', label: 'STEP 3' }, // teal
  4: { color: '#0EA5E9', label: 'STEP 4' }, // sky
  5: { color: '#6366F1', label: 'STEP 5' }, // indigo
  6: { color: '#A855F7', label: 'STEP 6' }, // violet
  7: { color: '#F43F5E', label: 'STEP 7' }, // rose
  0: { color: '#64748B', label: 'OTHER'  }, // slate fallback
} as const

export type StepKey = keyof typeof STEP_TOKENS
export type StepToken = { color: string; label: string; step: StepKey }

/**
 * Resolves any level string ("Step 3", "National League"…) to its step token.
 * Off-ladder or unset levels fall back to the slate OTHER token (key 0).
 */
export function getStepToken(level: string | null | undefined): StepToken {
  const n = stepNumber(level)
  const key = (n ?? 0) as StepKey
  return { ...STEP_TOKENS[key], step: key }
}
