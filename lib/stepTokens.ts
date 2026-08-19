import { stepNumber } from '@/lib/levels'
import { COLORS } from '@/components/ui/tokens'

// ─── Step colour tokens — SINGLE SOURCE OF TRUTH for step colour ──────────────
//
// Every surface that colours a non-league step (opportunity step badges, the
// left accent rail, level badges via lib/opportunityLevel.ts, future map pins /
// filter chips) MUST pull from here. Do not hardcode a step colour anywhere
// else — if you need one, import STEP_TOKENS / getStepToken.
//
// On the pyramid a LOWER number = HIGHER level (Step 1 is the top). Key 0 is the
// slate "OTHER" fallback for off-ladder / unknown levels.
//
// Steps 1–7 share ONE colour (accentOnDark) rather than a rainbow per step
// (corrected 20 Aug 2026) — the step NUMBER already carries the information;
// a distinct hue per step added no signal and created a false hierarchy (Step
// 2 also happened to land on the CLAUDE.md-reserved availability green, which
// this removes too). OTHER (key 0) stays slate — it's a genuinely different
// category (off-ladder), not a step number, so it's exempt from "regardless
// of step number".

export const STEP_TOKENS = {
  1: { color: COLORS.accentOnDark, label: 'STEP 1' },
  2: { color: COLORS.accentOnDark, label: 'STEP 2' },
  3: { color: COLORS.accentOnDark, label: 'STEP 3' },
  4: { color: COLORS.accentOnDark, label: 'STEP 4' },
  5: { color: COLORS.accentOnDark, label: 'STEP 5' },
  6: { color: COLORS.accentOnDark, label: 'STEP 6' },
  7: { color: COLORS.accentOnDark, label: 'STEP 7' },
  0: { color: '#64748B', label: 'OTHER'  }, // slate fallback — off-ladder, not a step number
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
